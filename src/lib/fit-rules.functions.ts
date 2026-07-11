import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_RULES, evaluateRules, type FitRules } from "@/agents/fit-rules.server";

const FitRulesInput = z.object({
  min_amount_cad: z.number().nonnegative().nullable(),
  max_amount_cad: z.number().nonnegative().nullable(),
  required_jurisdictions: z.array(z.string().min(2).max(8)).max(30),
  excluded_jurisdictions: z.array(z.string().min(2).max(8)).max(30),
  required_sectors: z.array(z.string().min(1).max(80)).max(30),
  excluded_sectors: z.array(z.string().min(1).max(80)).max(30),
  required_keywords: z.array(z.string().min(1).max(80)).max(30),
  excluded_keywords: z.array(z.string().min(1).max(80)).max(30),
  min_days_to_deadline: z.number().int().min(0).max(3650).nullable(),
  weight_llm: z.number().min(0).max(1),
  threshold_fit_pass: z.number().int().min(0).max(100),
  hard_fail_on_jurisdiction: z.boolean(),
  hard_fail_on_excluded_keyword: z.boolean(),
  hard_fail_on_amount: z.boolean(),
  hard_fail_on_deadline: z.boolean(),
  auto_archive_on_fail: z.boolean(),
  // SOP-IIAL
  applicant_types_allowed: z.array(z.string().min(1).max(50)).max(20),
  applicant_types_excluded: z.array(z.string().min(1).max(50)).max(20),
  lead_min_weeks: z.number().int().min(0).max(520).nullable(),
  partner_min_weeks: z.number().int().min(0).max(520).nullable(),
  iial_capabilities: z.array(z.string().min(1).max(80)).max(40),
  max_cost_share_pct_org_carries: z.number().min(0).max(100).nullable(),
  require_match_verification: z.boolean(),
  rolling_intake_passes_runway: z.boolean(),
  hard_fail_on_applicant_type: z.boolean(),
  hard_fail_on_runway: z.boolean(),
  hard_fail_on_capability: z.boolean(),
});

export const getFitRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fit_rules")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { rules: (data as FitRules | null) ?? DEFAULT_RULES, exists: !!data };
  });

export const saveFitRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FitRulesInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("fit_rules")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewFitRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        rules: FitRulesInput,
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("grants")
      .select(
        "id, title, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, country, summary, status",
      )
      .neq("status", "discovered")
      .limit(data.limit);
    if (error) throw new Error(error.message);

    // The "Trust the AI vs. the rules" slider (weight_llm) has no effect
    // unless a real LLM fit score enters combined_score() — reuse each
    // grant's already-computed grant_evaluations.fit_score (real, not
    // re-invoked here) so the preview's pass/review/block counts actually
    // shift with the slider, matching what evaluator.impl.server.ts does.
    const grantIds = (rows ?? []).map((g) => g.id as string);
    const llmScoreById = new Map<string, number>();
    if (grantIds.length > 0) {
      const { data: evals } = await context.supabase
        .from("grant_evaluations")
        .select("grant_id, fit_score")
        .eq("user_id", context.userId)
        .in("grant_id", grantIds);
      for (const e of evals ?? []) llmScoreById.set(e.grant_id, e.fit_score);
    }

    const out = (rows ?? []).map((g) => {
      const r = evaluateRules(data.rules as FitRules, g);
      const llmFit = llmScoreById.get(g.id as string);
      return {
        id: g.id as string,
        title: g.title as string,
        status: g.status as string,
        hard_fail: r.hard_fail,
        rule_score: r.rule_score,
        combined_score: r.combined_score(llmFit ?? 0),
        has_llm_score: llmFit != null,
        checks: r.checks,
      };
    });
    return { items: out };
  });
