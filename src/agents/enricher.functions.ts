import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EnricherOutput, PROMPTS } from "@/agents/schemas";

// Enricher v2 — re-engineered (Fase 7):
//   * Canonical language = ENGLISH. FR is lazy/on-demand, NOT this agent.
//   * Skip LLM entirely when the grant is already complete + already in EN.
//   * When the LLM is needed, ask ONLY for the missing fields ("needs" array).
//   * If source language ≠ 'en', move original title/summary to *_fr and
//     translate the canonical fields to EN.
export const runEnricher = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
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

    // ---- Diagnose what's actually missing ---------------------------------
    const sourceLang = (g.language ?? "en").toLowerCase();
    const needsTranslation = sourceLang !== "en";
    const hasAmount = g.amount_cad_min != null || g.amount_cad_max != null;
    const hasDeadline = !!g.deadline;
    const hasSectors = Array.isArray(g.sectors) && g.sectors.length > 0;
    const eligObj = (g.eligibility ?? {}) as Record<string, unknown>;
    const hasEligibility = Object.keys(eligObj).length > 0;

    const needs: string[] = [];
    if (needsTranslation) needs.push("title_en", "summary_en");
    if (!hasAmount) needs.push("amount_cad_min", "amount_cad_max");
    if (!hasDeadline) needs.push("deadline");
    if (!hasEligibility) needs.push("eligibility");
    if (!hasSectors) needs.push("sectors");

    // ---- FAST PATH: nothing to do, skip the LLM call entirely -------------
    if (needs.length === 0) {
      await supabaseAdmin
        .from("grants")
        .update({ status: "enriched", enriched_at: new Date().toISOString() })
        .eq("id", g.id);
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "enricher", status: "succeeded",
        model: "noop", input_tokens: 0, output_tokens: 0,
        latency_ms: Date.now() - t0, grant_id: g.id,
      });
      return { ok: true, runId, skipped: true, reason: "already_complete" };
    }

    // ---- SLOW PATH: focused LLM call, only the missing keys ---------------
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
            source_language: sourceLang,
            title: g.title,
            summary: g.summary,
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

    // ---- Apply only the fields we actually requested ----------------------
    const patch: Record<string, unknown> = {
      status: "enriched",
      enriched_at: new Date().toISOString(),
    };

    if (needsTranslation) {
      // Preserve the original (FR or other) in *_fr, install canonical EN in title/summary.
      if (parsed.title_en) {
        patch.title = parsed.title_en;
        if (!g.title_fr && g.title) patch.title_fr = g.title;
      }
      if (parsed.summary_en !== undefined) {
        patch.summary = parsed.summary_en ?? g.summary;
        if (!g.summary_fr && g.summary) patch.summary_fr = g.summary;
      }
      patch.language = "en"; // canonical is now EN
    }
    if (!hasAmount) {
      if (parsed.amount_cad_min !== undefined) patch.amount_cad_min = parsed.amount_cad_min;
      if (parsed.amount_cad_max !== undefined) patch.amount_cad_max = parsed.amount_cad_max;
    }
    if (!hasDeadline && parsed.deadline !== undefined) patch.deadline = parsed.deadline;
    if (!hasEligibility && parsed.eligibility) patch.eligibility = parsed.eligibility as never;
    if (!hasSectors && parsed.sectors?.length) patch.sectors = parsed.sectors;

    const { error: uerr } = await supabaseAdmin.from("grants").update(patch).eq("id", g.id);
    if (uerr) throw new Error(`grant_update_failed: ${uerr.message}`);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "enricher", status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0, grant_id: g.id,
    });
    return { ok: true, runId, filled: needs };
  });
