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
  await assertAgentEnabled("evaluator", userSupabase);
  const { callLlm } = await import("@/agents/llm.server");
  const { newRunId } = await import("@/lib/otel");
  const { traceStep } = await import("@/agents/trace.server");

  const runId = newRunId();
  const t0 = Date.now();
  const trace = (
    step: string,
    message: string,
    status: "info" | "ok" | "warn" | "error" | "start" | "done" = "info",
    payload?: Record<string, unknown>,
  ) =>
    traceStep({
      runId,
      grantId,
      agent: "evaluator",
      step,
      status,
      message,
      payload,
      db: userSupabase,
    });

  await trace("init", `Starting fit evaluation for grant ${grantId.slice(0, 8)}`, "start");
  await trace("load", "Loading grant and organization profile", "info");

  const [{ data: g, error: gerr }, { data: org, error: oerr }] = await Promise.all([
    userSupabase
      .from("grants")
      .select(
        "id, title, summary, url, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, country, status, funder:funders(name, jurisdiction)",
      )
      .eq("id", grantId)
      .maybeSingle(),
    userSupabase
      .from("org_profiles")
      .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (gerr) throw new Error(gerr.message);
  if (!g) {
    await trace("load", "Grant not found", "error");
    throw new Error("grant_not_found");
  }
  if (oerr) throw new Error(oerr.message);
  if (!org) {
    await trace("load", "Organization profile missing - complete /org first", "error");
    throw new Error("org_profile_missing");
  }
  await trace(
    "load",
    `Loaded grant "${g.title?.slice(0, 60)}" and org "${(org as { org_name?: string }).org_name ?? "(unnamed)"}"`,
    "ok",
  );

  if (g.status === "discovered") {
    await trace("gate", 'Refusing to evaluate - grant is still in "discovered" state', "error");
    throw new Error("grant_not_enriched_yet");
  }
  // Terminal states never need a fresh fit score — evaluating them still
  // spends a real LLM call for no business value (the grant's outcome is
  // already decided).
  if (["won", "lost", "archived", "expired"].includes(g.status)) {
    await trace("gate", `Refusing to evaluate - grant is in terminal state "${g.status}"`, "error");
    throw new Error("grant_in_terminal_state");
  }

  await trace("rules_load", "Loading user fit rules", "info");
  const { data: rulesRow } = await userSupabase
    .from("fit_rules")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const {
    DEFAULT_RULES,
    evaluateRules,
    deriveRulesFromOrg,
    computeAxisBreakdown,
    assessBudgetCapacity,
  } = await import("@/agents/fit-rules.server");
  // Explicit admin-configured fit_rules win; otherwise personalize the screening
  // rules from the org's real profile (jurisdictions + sectors) so fit reflects
  // who the applicant actually is instead of the generic CA-only defaults.
  const rules =
    (rulesRow as Parameters<typeof evaluateRules>[0] | null) ??
    deriveRulesFromOrg(org as Parameters<typeof deriveRulesFromOrg>[0], DEFAULT_RULES);
  const rulesResult = evaluateRules(rules, g as Parameters<typeof evaluateRules>[1]);
  for (const c of rulesResult.checks) {
    await trace(
      `rule:${c.id}`,
      `${c.label}: ${c.status.toUpperCase()} - ${c.detail}${c.hard ? " [hard]" : ""}`,
      c.status === "pass" ? "ok" : c.status === "fail" ? (c.hard ? "error" : "warn") : "info",
      { check: c.id, status: c.status, hard: c.hard },
    );
  }
  await trace(
    "rules_summary",
    `rule_score=${rulesResult.rule_score}/100 | hard_fail=${rulesResult.hard_fail} | weight_llm=${rules.weight_llm}`,
    rulesResult.hard_fail ? "warn" : "ok",
    { rule_score: rulesResult.rule_score, hard_fail: rulesResult.hard_fail },
  );

  // Transparent per-axis breakdown (deterministic, no extra LLM call) — the
  // "why" behind the score, surfaced to the UI instead of one opaque number.
  // Append the operational-capacity axis (grant amount vs org annual budget).
  const axisBreakdown = [
    ...computeAxisBreakdown(rulesResult.checks),
    assessBudgetCapacity(
      (org as { annual_budget_cad?: number | null }).annual_budget_cad,
      (g as { amount_cad_min?: number | null }).amount_cad_min,
      (g as { amount_cad_max?: number | null }).amount_cad_max,
    ),
  ];
  await trace(
    "axes",
    axisBreakdown
      .map((a) => `${a.label}: ${a.score == null ? "n/a" : a.score + "/10"}`)
      .join(" · "),
    "info",
    { axes: axisBreakdown },
  );

  await trace("llm_call", "Calling local model for fit verdict", "start");
  const tLlm = Date.now();
  const llm = await callLlm({
    agent: "evaluator",
    runId,
    temperature: 0.1,
    maxOutputTokens: 256,
    responseFormat: "json",
    messages: [
      {
        role: "system",
        content: `${PROMPTS.evaluator.system}\nPrompt version: ${PROMPTS.evaluator.version}`,
      },
      { role: "user", content: JSON.stringify({ grant: g, organization: org }) },
    ],
  });
  await trace(
    "llm_call",
    `Verdict received (${llm.outputTokens ?? "?"} tokens, ${Date.now() - tLlm}ms)`,
    "done",
    { in: llm.inputTokens, out: llm.outputTokens },
  );

  const usedModel = llm.model ?? "unknown";
  let parsed: ReturnType<typeof EvaluatorOutput.parse>;
  try {
    const raw = JSON.parse(llm.text);
    if (raw && typeof raw === "object" && raw.eligibility_pass === undefined) {
      raw.eligibility_pass = !rulesResult.hard_fail;
    }
    parsed = EvaluatorOutput.parse(raw);
  } catch (e) {
    await trace(
      "parse",
      `Schema validation failed: ${e instanceof Error ? e.message : String(e)}`,
      "error",
    );
    await userSupabase.from("agent_runs").insert({
      run_id: runId,
      agent: "evaluator",
      status: "failed",
      model: usedModel,
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      user_id: userId,
      grant_id: g.id,
      error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
    });
    throw new Error("evaluator_schema_validation");
  }

  // Persist normalized 0..1 scores even though the combined trace is 0..100.
  const llmFit = parsed.fit_score;
  const combinedFit = rulesResult.combined_score(llmFit);
  const combinedFitUnit = Math.max(0, Math.min(1, combinedFit / 100));
  const eligibilityPass =
    !rulesResult.hard_fail && parsed.eligibility_pass && combinedFit >= rules.threshold_fit_pass;
  parsed.fit_score = combinedFitUnit;
  parsed.eligibility_pass = eligibilityPass;
  await trace(
    "combine",
    `LLM=${Math.round(llmFit * 100)} | rules=${rulesResult.rule_score} | combined=${combinedFit} | threshold=${rules.threshold_fit_pass} | pass=${eligibilityPass}`,
    eligibilityPass ? "ok" : "warn",
    {
      llm_fit: llmFit,
      rule_score: rulesResult.rule_score,
      combined_fit: combinedFit,
      threshold: rules.threshold_fit_pass,
      pass: eligibilityPass,
    },
  );

  await trace(
    "parse",
    `Verdict: fit=${combinedFit}/100 | eligible=${parsed.eligibility_pass}`,
    "ok",
    { fit_score: parsed.fit_score, eligibility_pass: parsed.eligibility_pass },
  );
  await trace("rationale", parsed.rationale_en.slice(0, 600), "info");

  const { error: upErr } = await userSupabase.from("grant_evaluations").upsert(
    {
      user_id: userId,
      grant_id: g.id,
      fit_score: parsed.fit_score,
      eligibility_pass: parsed.eligibility_pass,
      rationale_en: parsed.rationale_en,
      rationale_fr: parsed.rationale_fr,
      axis_breakdown: axisBreakdown,
      model: usedModel,
      prompt_version: PROMPTS.evaluator.version,
      run_id: runId,
    },
    { onConflict: "user_id,grant_id" },
  );
  if (upErr) {
    await trace("persist", `grant_evaluations upsert failed: ${upErr.message}`, "error");
    throw new Error(`grant_evaluations_upsert_failed: ${upErr.message}`);
  }

  try {
    const { recordEvidence } = await import("@/agents/evidence.server");
    const grantUrl = (g as { url?: string }).url ?? "";
    await userSupabase
      .from("evidence_spans")
      .delete()
      .eq("grant_id", g.id)
      .eq("agent", "evaluator")
      .in("field", ["fit_score", "eligibility_pass"]);
    await recordEvidence({
      grantId: g.id,
      agent: "evaluator",
      field: "fit_score",
      value: parsed.fit_score,
      sourceUrl: grantUrl,
      snippet: parsed.rationale_en.slice(0, 1000),
      method: "llm",
      model: usedModel,
      runId,
      db: userSupabase,
    });
    await recordEvidence({
      grantId: g.id,
      agent: "evaluator",
      field: "eligibility_pass",
      value: parsed.eligibility_pass,
      sourceUrl: grantUrl,
      snippet: parsed.rationale_en.slice(0, 1000),
      method: "llm",
      model: usedModel,
      runId,
      db: userSupabase,
    });
  } catch {
    // Evidence capture should not block the evaluator result.
  }

  if (!parsed.eligibility_pass) {
    if (rules.auto_archive_on_fail) {
      await trace("gate", "Not eligible -> archiving grant (auto_archive_on_fail=true)", "warn");
      if (g.status === "discovered" || g.status === "enriched" || g.status === "scored") {
        await userSupabase
          .from("grants")
          .update({ status: "archived", fit_score: parsed.fit_score } as never)
          .eq("id", g.id);
      }
    } else {
      await trace("gate", "Not eligible - keeping current status", "warn");
      await userSupabase
        .from("grants")
        .update({ fit_score: parsed.fit_score } as never)
        .eq("id", g.id);
    }
  } else if (g.status === "discovered" || g.status === "enriched") {
    await trace("commit", `Eligible -> status=scored, fit=${parsed.fit_score}`, "ok");
    await userSupabase
      .from("grants")
      .update({
        status: "scored",
        scored_at: new Date().toISOString(),
        fit_score: parsed.fit_score,
      } as never)
      .eq("id", g.id);
  } else {
    await trace("commit", `Updated fit_score=${parsed.fit_score}`, "ok");
    await userSupabase
      .from("grants")
      .update({ fit_score: parsed.fit_score } as never)
      .eq("id", g.id);
  }

  await trace("done", `Evaluation complete in ${Date.now() - t0}ms`, "done", {
    total_ms: Date.now() - t0,
  });

  await userSupabase.from("agent_runs").insert({
    run_id: runId,
    agent: "evaluator",
    status: "succeeded",
    model: usedModel,
    input_tokens: llm.inputTokens,
    output_tokens: llm.outputTokens,
    latency_ms: Date.now() - t0,
    user_id: userId,
    grant_id: g.id,
  });
  return {
    ok: true,
    runId,
    fit_score: parsed.fit_score,
    eligibility_pass: parsed.eligibility_pass,
  };
}
