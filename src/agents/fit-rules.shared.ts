// Shared fit-rules types - can be imported from both client and server

export type FitRules = {
  min_amount_cad: number | null;
  max_amount_cad: number | null;
  required_jurisdictions: string[];
  excluded_jurisdictions: string[];
  required_sectors: string[];
  excluded_sectors: string[];
  required_keywords: string[];
  excluded_keywords: string[];
  min_days_to_deadline: number | null;
  weight_llm: number;
  threshold_fit_pass: number;
  hard_fail_on_jurisdiction: boolean;
  hard_fail_on_excluded_keyword: boolean;
  hard_fail_on_amount: boolean;
  hard_fail_on_deadline: boolean;
  auto_archive_on_fail: boolean;
  applicant_types_allowed: string[];
  applicant_types_excluded: string[];
  lead_min_weeks: number | null;
  partner_min_weeks: number | null;
  iial_capabilities: string[];
  max_cost_share_pct_org_carries: number | null;
  require_match_verification: boolean;
  rolling_intake_passes_runway: boolean;
  hard_fail_on_applicant_type: boolean;
  hard_fail_on_runway: boolean;
  hard_fail_on_capability: boolean;
};

export const DEFAULT_RULES: FitRules = {
  min_amount_cad: null,
  max_amount_cad: null,
  required_jurisdictions: ["CA"],
  excluded_jurisdictions: [],
  required_sectors: [],
  excluded_sectors: [],
  required_keywords: [],
  excluded_keywords: [],
  min_days_to_deadline: null,
  weight_llm: 0.4,
  threshold_fit_pass: 60,
  hard_fail_on_jurisdiction: true,
  hard_fail_on_excluded_keyword: true,
  hard_fail_on_amount: false,
  hard_fail_on_deadline: false,
  auto_archive_on_fail: true,
  applicant_types_allowed: ["nonprofit", "non-profit", "not-for-profit"],
  applicant_types_excluded: [
    "charity_only",
    "municipality_only",
    "university_only",
    "individual_only",
    "for_profit_only",
  ],
  lead_min_weeks: 4,
  partner_min_weeks: 8,
  iial_capabilities: [
    "supply chain",
    "wcis",
    "traceability",
    "certification",
    "micro-credential",
    "microcredential",
    "applied research",
    "feasibility",
    "smart city",
    "aiot",
    "iot",
    "climate",
    "circular economy",
    "circular",
    "ai",
    "artificial intelligence",
    "machine learning",
    "data",
    "digitization",
    "digital transformation",
  ],
  max_cost_share_pct_org_carries: 0.5,
  require_match_verification: true,
  rolling_intake_passes_runway: true,
  hard_fail_on_applicant_type: true,
  hard_fail_on_runway: true,
  hard_fail_on_capability: false,
};

// Minimal shape of the org profile the screening engine cares about.
export type OrgProfileLite = {
  sectors?: string[] | null;
  jurisdictions?: string[] | null;
  stage?: string | null;
  annual_budget_cad?: number | null;
  focus_areas?: string | string[] | null;
};

/**
 * Personalize screening rules from the organization's real profile.
 *
 * Why: the deterministic engine used to score every org against the same static
 * config (DEFAULT_RULES: jurisdictions=["CA"], no sectors), so "fit" ignored who
 * the applicant actually is. This is the org-vs-criteria gating the best grant
 * tools do (Granter.ai/Grantable). We only override a field when the org
 * actually declares it — otherwise we keep the caller's base rules, so an admin
 * who configured explicit fit_rules is never overridden.
 */
export function deriveRulesFromOrg(
  org: OrgProfileLite | null | undefined,
  base: FitRules = DEFAULT_RULES,
): FitRules {
  if (!org) return base;
  const rules: FitRules = { ...base };

  // Where the org can operate → required jurisdictions (soft by default).
  const juris = (org.jurisdictions ?? []).map((j) => String(j).trim()).filter(Boolean);
  if (juris.length > 0) rules.required_jurisdictions = Array.from(new Set(juris));

  // Org sectors + focus areas → soft required sectors (drives strategic-fit).
  const focus = Array.isArray(org.focus_areas)
    ? org.focus_areas
    : org.focus_areas
      ? String(org.focus_areas)
          .split(/[,;]+/)
          .map((s) => s.trim())
      : [];
  const sectors = [...(org.sectors ?? []), ...focus].map((s) => String(s).trim()).filter(Boolean);
  if (sectors.length > 0) rules.required_sectors = Array.from(new Set(sectors));

  return rules;
}
