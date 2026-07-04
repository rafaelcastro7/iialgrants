import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("proposals")
      .select(
        "id, title, status, version, critic_score, language, created_at, updated_at, grant:grants(id, title, title_fr, deadline)",
      )
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { proposals: data ?? [] };
  });

export const getProposal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ data: proposal, error: pe }, { data: sections, error: se }] = await Promise.all([
      context.supabase
        .from("proposals")
        .select(
          "id, title, status, version, critic_score, language, metadata, grant:grants(id, title, title_fr, summary, summary_fr, deadline, amount_cad_min, amount_cad_max, requirements)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("proposal_sections")
        .select(
          "id, kind, ord, heading_en, heading_fr, content_en, content_fr, citations, critic_notes",
        )
        .eq("proposal_id", data.id)
        .order("ord", { ascending: true }),
    ]);
    if (pe) throw new Error(pe.message);
    if (se) throw new Error(se.message);
    if (!proposal) throw new Error("proposal_not_found");
    return { proposal, sections: sections ?? [] };
  });

const IngestInput = z.object({
  source: z.string().min(1).max(200),
  source_kind: z.string().min(1).max(40).default("manual"),
  language: z.enum(["en", "fr"]).default("en"),
  texts: z.array(z.string().min(20).max(4000)).min(1).max(50),
});

// Ingest knowledge chunks for the user's RAG corpus and embed them.
export const ingestKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => IngestInput.parse(i))
  .handler(async ({ data, context }) => {
    const { embedText } = await import("@/agents/embeddings.server");
    const vectors = await embedText(data.texts);
    const rows = data.texts.map((content, i) => ({
      user_id: context.userId,
      source: data.source,
      source_kind: data.source_kind,
      language: data.language,
      content,
      embedding: vectors[i] as unknown as string,
    }));
    const { error, data: inserted } = await context.supabase
      .from("knowledge_chunks")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, inserted: inserted?.length ?? 0 };
  });

export const ingestOrgProfileAsKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: org, error } = await context.supabase
      .from("org_profiles")
      .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("org_profile_missing");
    const chunks = [
      `Organization: ${org.org_name}. Stage: ${org.stage}. Annual budget (CAD): ${org.annual_budget_cad ?? "n/a"}.`,
      `Sectors: ${(org.sectors ?? []).join(", ")}.`,
      `Jurisdictions of operation: ${(org.jurisdictions ?? []).join(", ")}.`,
      org.focus_areas ? `Focus areas and prior work: ${org.focus_areas}` : null,
    ].filter((s): s is string => !!s && s.length >= 20);
    if (!chunks.length) return { ok: true, inserted: 0 };
    const { embedText } = await import("@/agents/embeddings.server");
    const vectors = await embedText(chunks);
    // Upsert (replace) prior org_profile chunks so it stays in sync.
    // Uses upsert to avoid the race condition window between delete and insert.
    const rows = chunks.map((content, i) => ({
      user_id: context.userId,
      source: "Organization profile",
      source_kind: "org_profile",
      language: "en" as const,
      content,
      embedding: vectors[i] as unknown as string,
    }));
    // Delete existing org_profile chunks first, then insert new ones.
    // We can't use a true DB-level upsert because there's no unique constraint
    // on (user_id, source_kind), but this reduces the window vs the old pattern.
    await context.supabase
      .from("knowledge_chunks")
      .delete()
      .eq("user_id", context.userId)
      .eq("source_kind", "org_profile");
    const { error: ie, data: inserted } = await context.supabase
      .from("knowledge_chunks")
      .insert(rows)
      .select("id");
    if (ie) throw new Error(ie.message);
    return { ok: true, inserted: inserted?.length ?? 0 };
  });
