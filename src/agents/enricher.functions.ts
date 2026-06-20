import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EnricherOutput, PROMPTS } from "@/agents/schemas";

// Enricher v3 — Lovable-only, no translation.
//   * FR/EN stay as-is. French is for SEARCH only, never translated.
//   * Skip LLM entirely if grant already has amount/deadline/sectors/eligibility.
//   * Only asks LLM for the missing structured fields.
export const runEnricher = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newRunId } = await import("@/lib/otel");

    const runId = newRunId();
    const t0 = Date.now();

    const { data: g, error } = await supabaseAdmin
      .from("grants")
      .select("id, title, summary, language, url, status, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, enrich_attempts")
      .eq("id", data.grantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) throw new Error("grant_not_found");
    if (g.status !== "discovered") {
      return { ok: true, skipped: true, reason: `status=${g.status}`, runId };
    }
    if (((g as { enrich_attempts?: number }).enrich_attempts ?? 0) >= 3) {
      return { ok: true, skipped: true, reason: "max_attempts_reached", runId };
    }

    const hasAmount = g.amount_cad_min != null || g.amount_cad_max != null;
    const hasDeadline = !!g.deadline;
    const hasSectors = Array.isArray(g.sectors) && g.sectors.length > 0;
    const eligObj = (g.eligibility ?? {}) as Record<string, unknown>;
    const hasEligibility = Object.keys(eligObj).length > 0;

    const needs: string[] = [];
    if (!hasAmount) needs.push("amount_cad_min", "amount_cad_max");
    if (!hasDeadline) needs.push("deadline");
    if (!hasEligibility) needs.push("eligibility");
    if (!hasSectors) needs.push("sectors");

    // FAST PATH: 0 tokens.
    if (needs.length === 0) {
      await supabaseAdmin
        .from("grants")
        .update({ status: "enriched", enriched_at: new Date().toISOString() } as never)
        .eq("id", g.id);
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "enricher", status: "succeeded",
        model: "noop", input_tokens: 0, output_tokens: 0,
        latency_ms: Date.now() - t0, grant_id: g.id,
      });
      return { ok: true, runId, skipped: true, reason: "already_complete" };
    }

    const { callLlm } = await import("@/agents/llm.server");
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
            needs,
            source_language: g.language,
            title: g.title,
            summary: g.summary,
            url: g.url,
          }),
        },
      ],
    });

    let parsed: ReturnType<typeof EnricherOutput.parse>;
    try {
      parsed = EnricherOutput.parse(JSON.parse(llm.text));
    } catch (e) {
      const errMsg = `schema_validation: ${e instanceof Error ? e.message : String(e)}`;
      await supabaseAdmin.from("grants").update({
        enrich_attempts: ((g as { enrich_attempts?: number }).enrich_attempts ?? 0) + 1,
        enrich_last_error: errMsg.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      } as never).eq("id", g.id);
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "enricher", status: "failed",
        model: "google/gemini-2.5-flash",
        input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
        latency_ms: Date.now() - t0, grant_id: g.id,
        error: errMsg,
      });
      return { ok: false, runId, error: "schema_validation" };
    }

    const patch: Record<string, unknown> = {
      status: "enriched",
      enriched_at: new Date().toISOString(),
    };
    if (!hasAmount) {
      if (parsed.amount_cad_min !== undefined) patch.amount_cad_min = parsed.amount_cad_min;
      if (parsed.amount_cad_max !== undefined) patch.amount_cad_max = parsed.amount_cad_max;
    }
    if (!hasDeadline && parsed.deadline !== undefined) patch.deadline = parsed.deadline;
    if (!hasEligibility && parsed.eligibility) patch.eligibility = parsed.eligibility as never;
    if (!hasSectors && parsed.sectors?.length) patch.sectors = parsed.sectors;

    const { error: uerr } = await supabaseAdmin.from("grants").update(patch as never).eq("id", g.id);
    if (uerr) throw new Error(`grant_update_failed: ${uerr.message}`);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "enricher", status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0, grant_id: g.id,
    });
    return { ok: true, runId, filled: needs };
  });
