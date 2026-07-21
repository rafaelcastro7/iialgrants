// Per-grant audit page data source.
// Returns: the grant, every rule that was evaluated (with pass/fail/skip + reason),
// every evidence span used, the agent trace timeline, and the LLM rationale —
// so a user can see EXACTLY why a grant was accepted, shortlisted, or archived.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGrantAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: grant, error } = await context.supabase
      .from("grants")
      .select(
        "id, title, summary, amount_cad_min, amount_cad_max, deadline, sectors, eligibility, country, status, fit_score, enriched_at, scored_at, funder:funders(id, name, jurisdiction, source_url)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!grant) throw new Error("Grant not found");

    const [{ data: rulesRow }, { data: org }] = await Promise.all([
      context.supabase.from("fit_rules").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("org_profiles")
        .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const { DEFAULT_RULES, evaluateRules, deriveRulesFromOrg } =
      await import("@/agents/fit-rules.server");
    // Must mirror evaluator.impl.server.ts's rule resolution exactly — this
    // page's entire purpose is to honestly explain why a grant was accepted/
    // archived, so it has to evaluate against the SAME effective rules that
    // actually produced that decision, not the generic CA-only defaults.
    const rules =
      (rulesRow as Parameters<typeof evaluateRules>[0] | null) ??
      deriveRulesFromOrg(org as Parameters<typeof deriveRulesFromOrg>[0], DEFAULT_RULES);
    const ruleResult = evaluateRules(rules, {
      eligibility: grant.eligibility,
      deadline: grant.deadline,
      amount_cad_min: grant.amount_cad_min,
      amount_cad_max: grant.amount_cad_max,
      sectors: grant.sectors,
      country: grant.country,
      summary: grant.summary,
      title: grant.title,
    });

    const { data: evaluation } = await context.supabase
      .from("grant_evaluations")
      .select(
        "fit_score,llm_fit_score,eligibility_pass,rationale_en,model,axis_breakdown,rule_snapshot,evaluated_at,created_at",
      )
      .eq("user_id", context.userId)
      .eq("grant_id", data.id)
      .maybeSingle();

    const { data: evidence } = await context.supabase
      .from("evidence_spans")
      .select("agent, field, value, source_url, snippet, extraction_method, confidence, created_at")
      .eq("grant_id", data.id)
      .order("created_at", { ascending: true })
      .limit(100);

    const { data: trace } = await context.supabase
      .from("agent_trace_steps")
      .select("run_id, agent, step, status, message, duration_ms, created_at")
      .eq("grant_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);

    // Prefer the immutable snapshot that produced the stored score. Legacy
    // evaluations fall back to a transparent recalculation with current rules.
    const currentRuleSummary = {
      checks: ruleResult.checks,
      hard_fail: ruleResult.hard_fail,
      rule_score: ruleResult.rule_score,
      detected_role: ruleResult.detected_role,
      cost_share_pct: ruleResult.cost_share_pct,
      rolling_intake: ruleResult.rolling_intake,
      threshold_fit_pass: rules.threshold_fit_pass,
      weight_llm: rules.weight_llm,
    };
    const snapshot = evaluation?.rule_snapshot;
    const ruleSummary =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? (snapshot as typeof currentRuleSummary)
        : currentRuleSummary;

    const verdict: "accepted" | "rejected" | "pending" = ruleSummary.hard_fail
      ? "rejected"
      : grant.status === "archived"
        ? "rejected"
        : evaluation && evaluation.fit_score != null
          ? evaluation.eligibility_pass &&
            evaluation.fit_score * 100 >= ruleSummary.threshold_fit_pass
            ? "accepted"
            : "rejected"
          : "pending";

    return {
      grant,
      rules: ruleSummary,
      evaluation,
      evidence: evidence ?? [],
      trace: trace ?? [],
      verdict,
      rule_provenance:
        snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
          ? "evaluation_snapshot"
          : "current_rules_legacy",
    };
  });
