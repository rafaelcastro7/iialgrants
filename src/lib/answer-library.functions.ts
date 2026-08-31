import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AnswerInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(160),
  question: z.string().trim().max(1000).nullable(),
  answer_en: z.string().trim().min(20).max(20_000),
  answer_fr: z.string().trim().max(20_000).nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  evidence_notes: z.string().trim().max(4000).nullable(),
  verified: z.boolean().default(false),
});

export const listAnswerLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("answer_library")
      .select(
        "id, label, question, answer_en, answer_fr, tags, evidence_notes, verified_at, use_count, last_used_at, updated_at",
      )
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { answers: data ?? [] };
  });

export const saveAnswerLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AnswerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { getTenantPrincipal } = await import("@/lib/tenant-access.server");
    const principal = await getTenantPrincipal(context.supabase, context.userId);
    if (!principal.orgId) throw new Error("organization_required");

    const existing = data.id
      ? await context.supabase
          .from("answer_library")
          .select("id, knowledge_chunk_id")
          .eq("id", data.id)
          .maybeSingle()
      : { data: null, error: null };
    if (existing.error) throw new Error(existing.error.message);
    if (data.id && !existing.data) throw new Error("answer_not_found");

    const savedAt = new Date().toISOString();
    const answerPayload = {
      label: data.label,
      question: data.question,
      answer_en: data.answer_en,
      answer_fr: data.answer_fr,
      tags: data.tags,
      evidence_notes: data.evidence_notes,
      updated_by: context.userId,
      verified_at: data.verified ? savedAt : null,
    };
    const answerWrite = existing.data
      ? context.supabase.from("answer_library").update(answerPayload).eq("id", existing.data.id)
      : context.supabase.from("answer_library").insert({
          ...answerPayload,
          org_id: principal.orgId,
          created_by: context.userId,
        });
    const { data: answer, error: answerError } = await answerWrite
      .select("id, knowledge_chunk_id")
      .single();
    if (answerError) throw new Error(answerError.message);

    const chunkContent = [
      `Reusable response: ${data.label}`,
      data.question ? `Question: ${data.question}` : null,
      `Approved answer: ${data.answer_en}`,
      data.evidence_notes ? `Evidence notes: ${data.evidence_notes}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    let embedding: string | null = null;
    try {
      const { embedText } = await import("@/agents/embeddings.server");
      const [vector] = await embedText(chunkContent);
      embedding = vector as unknown as string;
    } catch (error) {
      console.warn(
        "[answer-library] saved without vector embedding; lexical retrieval remains available:",
        error instanceof Error ? error.message : String(error),
      );
    }

    const chunkPayload = {
      org_id: principal.orgId,
      source: `Answer library: ${data.label}`,
      source_kind: "answer_library",
      language: "en" as const,
      content: chunkContent,
      embedding,
      metadata: { answer_id: answer.id, tags: data.tags, verified: data.verified },
    };
    let chunkId = answer.knowledge_chunk_id;
    if (chunkId) {
      const { data: updated, error } = await context.supabase
        .from("knowledge_chunks")
        .update(chunkPayload)
        .eq("id", chunkId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) chunkId = null;
    }
    if (!chunkId) {
      const { data: chunk, error } = await context.supabase
        .from("knowledge_chunks")
        .insert({ ...chunkPayload, user_id: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      chunkId = chunk.id;
      const { error: linkError } = await context.supabase
        .from("answer_library")
        .update({ knowledge_chunk_id: chunkId })
        .eq("id", answer.id);
      if (linkError) throw new Error(linkError.message);
    }

    return { ok: true, id: answer.id, indexed: embedding != null };
  });

export const archiveAnswerLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: answer, error: readError } = await context.supabase
      .from("answer_library")
      .select("id, knowledge_chunk_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!answer) throw new Error("answer_not_found");
    const { data: archived, error } = await context.supabase
      .from("answer_library")
      .update({ archived_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!archived) throw new Error("answer_not_authorized");
    if (answer.knowledge_chunk_id) {
      await context.supabase.from("knowledge_chunks").delete().eq("id", answer.knowledge_chunk_id);
    }
    return { ok: true };
  });
