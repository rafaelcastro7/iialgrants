import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROMPTS, WriterOutput } from "@/agents/schemas";
import { bumpProposalVersion } from "@/lib/proposal-versioning";
import { resolveModel } from "@/agents/model-router.server";

// Local models sometimes wrap JSON in ```fences``` or add prose; slice to the
// outermost object so a strict schema parse doesn't fail on cosmetic wrapping.
function extractJsonObject(text: string): string {
  let t = (text ?? "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return t;
}

// Validates that every [dN] marker in content references a provided chunk id.
export function validateCitations(
  content: string,
  citations: { marker: string; chunk_id: string }[],
  allowedChunkIds: Set<string>,
): { ok: boolean; reason?: string } {
  const used = new Set(content.match(/\[d\d+\]/g) ?? []);
  const declared = new Map(citations.map((c) => [c.marker, c.chunk_id]));
  for (const m of used) {
    const id = declared.get(m);
    if (!id) return { ok: false, reason: `marker ${m} used in content but not declared` };
    if (!allowedChunkIds.has(id)) return { ok: false, reason: `marker ${m} cites unknown chunk` };
  }
  for (const c of citations) {
    if (!allowedChunkIds.has(c.chunk_id))
      return { ok: false, reason: `citation chunk_id ${c.chunk_id} not in retrieved set` };
  }
  return { ok: true };
}

export const draftSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        sectionId: z.string().uuid(),
        topK: z.number().int().min(2).max(12).default(6),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("writer");
    const { callLlm } = await import("@/agents/llm.server");
    const { ragRetrieve } = await import("@/lib/rag.server");
    const { newRunId } = await import("@/lib/otel");
    const runId = newRunId();
    const t0 = Date.now();

    const { data: section, error: se } = await context.supabase
      .from("proposal_sections")
      .select(
        "id, kind, heading_en, heading_fr, critic_notes, proposal_id, proposal:proposals(id, title, language, grant:grants(id, title, summary, deadline, amount_cad_min, amount_cad_max, eligibility, sectors))",
      )
      .eq("id", data.sectionId)
      .maybeSingle();
    if (se) throw new Error(se.message);
    if (!section) throw new Error("section_not_found");

    const proposal = Array.isArray(section.proposal) ? section.proposal[0] : section.proposal;
    const grant = proposal
      ? Array.isArray(proposal.grant)
        ? proposal.grant[0]
        : proposal.grant
      : null;
    if (!grant) throw new Error("grant_not_found");

    const notes = (section.critic_notes ?? {}) as { angle?: string; must_cover?: string[] };
    const query = [
      section.heading_en,
      notes.angle ?? "",
      (notes.must_cover ?? []).join(", "),
      grant.title,
    ]
      .filter(Boolean)
      .join(" — ");

    const hits = await ragRetrieve(context.supabase, context.userId, query, data.topK);
    if (hits.length === 0) {
      throw new Error("no_knowledge_chunks: ingest org profile or documents first");
    }
    const numbered = hits.map((h, i) => ({ marker: `[d${i + 1}]`, ...h }));
    const allowed = new Set(hits.map((h) => h.id));

    const llm = await callLlm({
      agent: "writer",
      runId,
      temperature: 0.3,
      responseFormat: "json",
      messages: [
        {
          role: "system",
          content: `${PROMPTS.writer.system}\nPrompt version: ${PROMPTS.writer.version}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            grant: {
              title: grant.title,
              summary: grant.summary,
              deadline: grant.deadline,
              amount_cad_min: grant.amount_cad_min,
              amount_cad_max: grant.amount_cad_max,
              eligibility: grant.eligibility,
              sectors: grant.sectors,
            },
            section: {
              kind: section.kind,
              heading_en: section.heading_en,
              heading_fr: section.heading_fr,
              angle: notes.angle,
              must_cover: notes.must_cover,
            },
            chunks: numbered.map((c) => ({
              marker: c.marker,
              id: c.id,
              source: c.source,
              language: c.language,
              content: c.content,
            })),
          }),
        },
      ],
    });

    const model = resolveModel("writer");
    let parsed;
    try {
      parsed = WriterOutput.parse(JSON.parse(extractJsonObject(llm.text)));
    } catch (parseErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "writer",
        status: "failed",
        model,
        input_tokens: llm.inputTokens ?? 0,
        output_tokens: llm.outputTokens ?? 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        grant_id: grant.id,
        error: `parse_error: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
        metadata: { section_id: section.id, llm_output: llm.text?.slice(0, 200) },
      });
      throw new Error(
        `writer_parse_failed: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
      );
    }
    const check = validateCitations(parsed.content_en, parsed.citations, allowed);
    if (!check.ok) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "writer",
        status: "failed",
        model,
        input_tokens: llm.inputTokens,
        output_tokens: llm.outputTokens,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        grant_id: grant.id,
        error: `citation_validation: ${check.reason}`,
        metadata: { section_id: section.id },
      });
      throw new Error(`writer_citation_invalid: ${check.reason}`);
    }

    const citationsForStorage = parsed.citations.map((c) => ({
      marker: c.marker,
      chunk_id: c.chunk_id,
      snippet: c.snippet,
    }));
    const { error: ue } = await context.supabase
      .from("proposal_sections")
      .update({
        content_en: parsed.content_en,
        content_fr: parsed.content_fr,
        citations: citationsForStorage,
      })
      .eq("id", section.id);
    if (ue) throw new Error(ue.message);

    // Append immutable citation rows.
    if (parsed.citations.length) {
      const { error: ce } = await context.supabase.from("proposal_citations").insert(
        parsed.citations.map((c) => ({
          section_id: section.id,
          chunk_id: c.chunk_id,
          user_id: context.userId,
          marker: c.marker,
          snippet: c.snippet,
        })),
      );
      if (ce) throw new Error(ce.message);
    }

    await bumpProposalVersion(context.supabase, proposal.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId,
      agent: "writer",
      status: "succeeded",
      model: "qwen3:14b",
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      user_id: context.userId,
      grant_id: grant.id,
      metadata: { section_id: section.id, citations: parsed.citations.length, hits: hits.length },
    });

    return { ok: true, sectionId: section.id, citations: parsed.citations.length, runId };
  });
