import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EvaluatorOutput, PROMPTS } from "@/agents/schemas";

// Evaluator agent (Fase 2). Scores grant↔org fit for the signed-in user
// and persists into grant_evaluations + updates grants.fit_score
// (last evaluator wins for display; per-user scores live in grant_evaluations).
export const runEvaluator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { callLlm } = await import("@/agents/llm.server");
    const { newRunId } = await import("@/lib/otel");
    const runId = newRunId();
    const t0 = Date.now();
    const userId = context.userId;

    const [{ data: g, error: gerr }, { data: org, error: oerr }] = await Promise.all([
      context.supabase
        .from("grants")
        .select("id, title, summary, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, country, status, funder:funders(name, jurisdiction)")
        .eq("id", data.grantId)
        .maybeSingle(),
      context.supabase
        .from("org_profiles")
        .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (gerr) throw new Error(gerr.message);
    if (!g) throw new Error("grant_not_found");
    if (oerr) throw new Error(oerr.message);
    if (!org) throw new Error("org_profile_missing");

    const llm = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "evaluator",
      runId,
      temperature: 0.1,
      responseFormat: "json",
      messages: [
        { role: "system", content: `${PROMPTS.evaluator.system}\nPrompt version: ${PROMPTS.evaluator.version}` },
        { role: "user", content: JSON.stringify({ grant: g, organization: org }) },
      ],
    });

    let parsed: ReturnType<typeof EvaluatorOutput.parse>;
    try {
      parsed = EvaluatorOutput.parse(JSON.parse(llm.text));
    } catch (e) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "evaluator", status: "failed",
        model: "google/gemini-2.5-flash",
        input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
        latency_ms: Date.now() - t0, user_id: userId, grant_id: g.id,
        error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
      });
      throw new Error("evaluator_schema_validation");
    }

    // Persist evaluation (idempotent per user × grant).
    await context.supabase.from("grant_evaluations").upsert(
      {
        user_id: userId,
        grant_id: g.id,
        fit_score: parsed.fit_score,
        eligibility_pass: parsed.eligibility_pass,
        rationale_en: parsed.rationale_en,
        rationale_fr: parsed.rationale_fr,
        model: "google/gemini-2.5-flash",
        prompt_version: PROMPTS.evaluator.version,
        run_id: runId,
      },
      { onConflict: "user_id,grant_id" },
    );

    // Transition grant to 'scored' (admin write via service role).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (g.status === "enriched") {
      await supabaseAdmin.from("grants").update({
        status: "scored",
        scored_at: new Date().toISOString(),
        fit_score: parsed.fit_score,
      }).eq("id", g.id);
    } else {
      await supabaseAdmin.from("grants").update({ fit_score: parsed.fit_score }).eq("id", g.id);
    }

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "evaluator", status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0, user_id: userId, grant_id: g.id,
    });
    return { ok: true, runId, fit_score: parsed.fit_score, eligibility_pass: parsed.eligibility_pass };
  });
