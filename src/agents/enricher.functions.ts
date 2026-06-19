import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EnricherOutput, PROMPTS } from "@/agents/schemas";

// Enricher agent (Fase 2). Reads a grant in state 'discovered',
// fills in FR-CA translation + missing fields, transitions to 'enriched'.
export const runEnricher = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { callLlm } = await import("@/agents/llm.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newRunId } = await import("@/lib/otel");

    const runId = newRunId();
    const t0 = Date.now();

    const { data: g, error } = await supabaseAdmin
      .from("grants")
      .select("id, title, title_fr, summary, summary_fr, language, url, status, amount_cad_min, amount_cad_max, deadline, eligibility, sectors")
      .eq("id", data.grantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) throw new Error("grant_not_found");
    if (g.status !== "discovered") {
      return { ok: true, skipped: true, reason: `status=${g.status}`, runId };
    }

    const llm = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "enricher",
      runId,
      temperature: 0.1,
      responseFormat: "json",
      messages: [
        { role: "system", content: `${PROMPTS.enricher.system}\nPrompt version: ${PROMPTS.enricher.version}` },
        {
          role: "user",
          content: JSON.stringify({
            title: g.title,
            title_fr: g.title_fr,
            summary: g.summary,
            summary_fr: g.summary_fr,
            language: g.language,
            url: g.url,
            current: {
              amount_cad_min: g.amount_cad_min,
              amount_cad_max: g.amount_cad_max,
              deadline: g.deadline,
              eligibility: g.eligibility,
              sectors: g.sectors,
            },
          }),
        },
      ],
    });

    let parsed: ReturnType<typeof EnricherOutput.parse>;
    try {
      parsed = EnricherOutput.parse(JSON.parse(llm.text));
    } catch (e) {
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "enricher", status: "failed",
        model: "google/gemini-2.5-flash",
        input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
        latency_ms: Date.now() - t0, grant_id: g.id,
        error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
      });
      return { ok: false, runId, error: "schema_validation" };
    }

    const { error: uerr } = await supabaseAdmin
      .from("grants")
      .update({
        title_fr: parsed.title_fr,
        summary_fr: parsed.summary_fr ?? g.summary_fr,
        amount_cad_min: parsed.amount_cad_min ?? g.amount_cad_min,
        amount_cad_max: parsed.amount_cad_max ?? g.amount_cad_max,
        deadline: parsed.deadline ?? g.deadline,
        eligibility: (parsed.eligibility ?? g.eligibility ?? {}) as never,
        sectors: parsed.sectors?.length ? parsed.sectors : g.sectors,
        status: "enriched",
        enriched_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    if (uerr) throw new Error(`grant_update_failed: ${uerr.message}`);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "enricher", status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0, grant_id: g.id,
    });
    return { ok: true, runId };
  });
