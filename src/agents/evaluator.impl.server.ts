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
  const { traceStep } = await import("@/agents/trace.server");

  const runId = newRunId();
  const t0 = Date.now();
  const trace = (step: string, message: string, status: "info" | "ok" | "warn" | "error" | "start" | "done" = "info", payload?: Record<string, unknown>) =>
    traceStep({ runId, grantId, agent: "evaluator", step, status, message, payload });

  await trace("init", `Starting fit evaluation for grant ${grantId.slice(0, 8)}`, "start");
  await trace("load", "Loading grant + organization profile", "info");

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
  if (!g) { await trace("load", "Grant not found", "error"); throw new Error("grant_not_found"); }
  if (oerr) throw new Error(oerr.message);
  if (!org) { await trace("load", "Organization profile missing — fill /org first", "error"); throw new Error("org_profile_missing"); }
  await trace("load", `Loaded grant "${g.title?.slice(0, 60)}" + org "${(org as { org_name?: string }).org_name ?? "(unnamed)"}"`, "ok");

  if (g.status === "discovered") {
    await trace("gate", `Refusing to evaluate — grant is still in "discovered" state (no enriched data)`, "error");
    throw new Error("grant_not_enriched_yet");
  }

  // Load user fit-rules (deterministic gate + score blend)
  await trace("rules_load", "Loading user fit rules", "info");
  const { data: rulesRow } = await userSupabase
    .from("fit_rules").select("*").eq("user_id", userId).maybeSingle();
  const { DEFAULT_RULES, evaluateRules } = await import("@/agents/fit-rules.server");
  const rules = (rulesRow as Parameters<typeof evaluateRules>[0] | null) ?? DEFAULT_RULES;
  const rulesResult = evaluateRules(rules, g as Parameters<typeof evaluateRules>[1]);
  for (const c of rulesResult.checks) {
    await trace(
      `rule:${c.id}`,
      `${c.label}: ${c.status.toUpperCase()} — ${c.detail}${c.hard ? " [hard]" : ""}`,
      c.status === "pass" ? "ok" : c.status === "fail" ? (c.hard ? "error" : "warn") : "info",
      { check: c.id, status: c.status, hard: c.hard },
    );
  }
  await trace("rules_summary",
    `rule_score=${rulesResult.rule_score}/100 · hard_fail=${rulesResult.hard_fail} · weight_llm=${rules.weight_llm}`,
    rulesResult.hard_fail ? "warn" : "ok",
    { rule_score: rulesResult.rule_score, hard_fail: rulesResult.hard_fail });

  await trace("llm_call", "Calling Gemini 2.5 Flash for fit verdict", "start");
  const tLlm = Date.now();
  const llm = await callLlm({
    model: "google/gemini-2.5-flash",
    agent: "evaluator",
    runId, temperature: 0.1, responseFormat: "json",
    messages: [
      { role: "system", content: `${PROMPTS.evaluator.system}\nPrompt version: ${PROMPTS.evaluator.version}` },
      { role: "user", content: JSON.stringify({ grant: g, organization: org }) },
    ],
  });
  await trace("llm_call", `Verdict received (${llm.outputTokens ?? "?"} tokens, ${Date.now() - tLlm}ms)`, "done", { in: llm.inputTokens, out: llm.outputTokens });

  let parsed: ReturnType<typeof EvaluatorOutput.parse>;
  try { parsed = EvaluatorOutput.parse(JSON.parse(llm.text)); }
  catch (e) {
    await trace("parse", `Schema validation failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "evaluator", status: "failed",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0, user_id: userId, grant_id: g.id,
      error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
    });
    throw new Error("evaluator_schema_validation");
  }

  // Combine LLM verdict with deterministic rules. combined_fit is on 0–100
  // scale (matches threshold_fit_pass). The DB columns grants.fit_score and
  // grant_evaluations.fit_score are numeric(4,3) constrained to 0..1, so we
  // persist the normalized value (combined_fit / 100) and keep traces in 0–100.
  const llm_fit = parsed.fit_score;                             // 0..1
  const combined_fit = rulesResult.combined_score(llm_fit);     // 0..100
  const combined_fit_unit = Math.max(0, Math.min(1, combined_fit / 100));
  const eligibility_pass = !rulesResult.hard_fail && parsed.eligibility_pass && combined_fit >= rules.threshold_fit_pass;
  parsed.fit_score = combined_fit_unit;
  parsed.eligibility_pass = eligibility_pass;
  await trace("combine",
    `LLM=${Math.round(llm_fit * 100)} · rules=${rulesResult.rule_score} · combined=${combined_fit} · threshold=${rules.threshold_fit_pass} · pass=${eligibility_pass}`,
    eligibility_pass ? "ok" : "warn",
    { llm_fit, rule_score: rulesResult.rule_score, combined_fit, threshold: rules.threshold_fit_pass, pass: eligibility_pass });

  await trace("parse", `Verdict: fit=${combined_fit}/100 · eligible=${parsed.eligibility_pass}`, "ok", { fit_score: parsed.fit_score, eligibility_pass: parsed.eligibility_pass });
  await trace("rationale", parsed.rationale_en.slice(0, 600), "info");

  const { error: upErr } = await userSupabase.from("grant_evaluations").upsert({
    user_id: userId, grant_id: g.id,
    fit_score: parsed.fit_score,
    eligibility_pass: parsed.eligibility_pass,
    rationale_en: parsed.rationale_en, rationale_fr: parsed.rationale_fr,
    model: "google/gemini-2.5-flash",
    prompt_version: PROMPTS.evaluator.version, run_id: runId,
  }, { onConflict: "user_id,grant_id" });
  if (upErr) {
    await trace("persist", `grant_evaluations upsert failed: ${upErr.message}`, "error");
    throw new Error(`grant_evaluations_upsert_failed: ${upErr.message}`);
  }

  try {
    const { recordEvidence } = await import("@/agents/evidence.server");
    const grantUrl = (g as { url?: string }).url ?? "";
    // Idempotency: re-running the evaluator must NOT accumulate duplicate
    // evidence rows. Drop prior evaluator spans for this grant+field pair
    // before recording the fresh verdict.
    await supabaseAdmin.from("evidence_spans").delete()
      .eq("grant_id", g.id)
      .eq("agent", "evaluator")
      .in("field", ["fit_score", "eligibility_pass"]);
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

  if (!parsed.eligibility_pass) {
    if (rules.auto_archive_on_fail) {
      await trace("gate", "Not eligible → archiving grant (auto_archive_on_fail=true)", "warn");
      if (g.status === "discovered" || g.status === "enriched" || g.status === "scored") {
        await supabaseAdmin.from("grants").update({
          status: "archived", fit_score: parsed.fit_score,
        } as never).eq("id", g.id);
      }
    } else {
      await trace("gate", "Not eligible — keeping status (auto_archive_on_fail=false)", "warn");
      await supabaseAdmin.from("grants").update({ fit_score: parsed.fit_score } as never).eq("id", g.id);
    }
  } else if (g.status === "discovered" || g.status === "enriched") {
    await trace("commit", `Eligible → status = scored, fit = ${parsed.fit_score}`, "ok");
    await supabaseAdmin.from("grants").update({
      status: "scored", scored_at: new Date().toISOString(), fit_score: parsed.fit_score,
    } as never).eq("id", g.id);
  } else {
    await trace("commit", `Updated fit_score = ${parsed.fit_score}`, "ok");
    await supabaseAdmin.from("grants").update({ fit_score: parsed.fit_score } as never).eq("id", g.id);
  }


  await trace("done", `Evaluation complete in ${Date.now() - t0}ms`, "done", { total_ms: Date.now() - t0 });

  await supabaseAdmin.from("agent_runs").insert({
    run_id: runId, agent: "evaluator", status: "succeeded",
    model: "google/gemini-2.5-flash",
    input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
    latency_ms: Date.now() - t0, user_id: userId, grant_id: g.id,
  });
  return { ok: true, runId, fit_score: parsed.fit_score, eligibility_pass: parsed.eligibility_pass };
}
