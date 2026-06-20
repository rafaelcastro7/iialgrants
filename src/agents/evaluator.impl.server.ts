// Server-only Evaluator implementation. Extracted from runEvaluator so it
// can be invoked directly from orchestrators (auto-evaluate, discoverAll)
// without going through the TanStack server-fn resolver.

import { EvaluatorOutput, PROMPTS } from "@/agents/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function evaluateGrantImpl(opts: {
  grantId: string;
  userId: string;
  userSupabase: SupabaseClient;
}) {
  const { grantId, userId, userSupabase } = opts;
  const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
  await assertAgentEnabled("evaluator");
  const { callLlm } = await import("@/agents/llm.server");
  const { newRunId } = await import("@/lib/otel");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const runId = newRunId();
  const t0 = Date.now();

  const [{ data: g, error: gerr }, { data: org, error: oerr }] = await Promise.all([
    userSupabase
      .from("grants")
      .select("id, title, summary, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, country, status, funder:funders(name, jurisdiction)")
      .eq("id", grantId)
      .maybeSingle(),
    userSupabase
      .from("org_profiles")
      .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (gerr) throw new Error(gerr.message);
  if (!g) throw new Error("grant_not_found");
  if (oerr) throw new Error(oerr.message);
  if (!org) throw new Error("org_profile_missing");

  // Gate: never evaluate a grant that hasn't been enriched — its fields may
  // be incomplete/missing and the LLM would synthesize a misleading verdict.
  if (g.status === "discovered") {
    throw new Error("grant_not_enriched_yet");
  }

  const llm = await callLlm({
    model: "google/gemini-2.5-flash",
    agent: "evaluator",
    runId, temperature: 0.1, responseFormat: "json",
    messages: [
      { role: "system", content: `${PROMPTS.evaluator.system}\nPrompt version: ${PROMPTS.evaluator.version}` },
      { role: "user", content: JSON.stringify({ grant: g, organization: org }) },
    ],
  });

  let parsed: ReturnType<typeof EvaluatorOutput.parse>;
  try { parsed = EvaluatorOutput.parse(JSON.parse(llm.text)); }
  catch (e) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "evaluator", status: "failed",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0, user_id: userId, grant_id: g.id,
      error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
    });
    throw new Error("evaluator_schema_validation");
  }

  await userSupabase.from("grant_evaluations").upsert({
    user_id: userId, grant_id: g.id,
    fit_score: parsed.fit_score,
    eligibility_pass: parsed.eligibility_pass,
    rationale_en: parsed.rationale_en, rationale_fr: parsed.rationale_fr,
    model: "google/gemini-2.5-flash",
    prompt_version: PROMPTS.evaluator.version, run_id: runId,
  }, { onConflict: "user_id,grant_id" });

  // Record evidence for the verdict — the rationale itself + the grant fields
  // it synthesizes from. Source is the grant's canonical URL.
  try {
    const { recordEvidence } = await import("@/agents/evidence.server");
    const grantUrl = (g as { url?: string }).url ?? "";
    await recordEvidence({
      grantId: g.id, agent: "evaluator", field: "fit_score",
      value: parsed.fit_score, sourceUrl: grantUrl,
      snippet: parsed.rationale_en.slice(0, 1000),
      method: "llm", model: "google/gemini-2.5-flash", runId,
    });
    await recordEvidence({
      grantId: g.id, agent: "evaluator", field: "eligibility_pass",
      value: parsed.eligibility_pass, sourceUrl: grantUrl,
      snippet: parsed.rationale_en.slice(0, 1000),
      method: "llm", model: "google/gemini-2.5-flash", runId,
    });
  } catch { /* evidence is non-blocking */ }

  // Eligibility-first gating: if we don't qualify, archive immediately and
  // stop spending tokens on enrichment/scoring downstream.
  if (!parsed.eligibility_pass) {
    if (g.status === "discovered" || g.status === "enriched" || g.status === "scored") {
      await supabaseAdmin.from("grants").update({
        status: "archived", fit_score: parsed.fit_score,
      } as never).eq("id", g.id);
    }
  } else if (g.status === "discovered" || g.status === "enriched") {
    await supabaseAdmin.from("grants").update({
      status: "scored", scored_at: new Date().toISOString(), fit_score: parsed.fit_score,
    } as never).eq("id", g.id);
  } else {
    await supabaseAdmin.from("grants").update({ fit_score: parsed.fit_score } as never).eq("id", g.id);
  }

  await supabaseAdmin.from("agent_runs").insert({
    run_id: runId, agent: "evaluator", status: "succeeded",
    model: "google/gemini-2.5-flash",
    input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
    latency_ms: Date.now() - t0, user_id: userId, grant_id: g.id,
  });
  return { ok: true, runId, fit_score: parsed.fit_score, eligibility_pass: parsed.eligibility_pass };
}
