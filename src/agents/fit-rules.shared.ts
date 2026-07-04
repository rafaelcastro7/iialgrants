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

// ─── Transparent multi-axis breakdown ─────────────────────────────────────────
// The best grant tools (Grantable) show WHY a grant scores what it does across
// named axes instead of one opaque number; Instrumentl's weakness is exactly the
// opposite (keyword matches with no competitiveness signal). We derive a
// per-axis 0–10 breakdown DETERMINISTICALLY from the screening checks we already
// compute — no extra LLM call, fully cited by each check's detail string.

export type AxisKey = "eligibility" | "geography" | "sector" | "budget" | "timeline" | "capacity";

export type AxisScore = {
  axis: AxisKey;
  label: string;
  /** 0–10, or null when no check in this axis was evaluable (N/A). */
  score: number | null;
  status: "pass" | "partial" | "fail" | "na";
  /** Human-readable reasons straight from the deterministic checks. */
  reasons: string[];
  hardFail: boolean;
};

type CheckLite = {
  id: string;
  status: "pass" | "fail" | "warn" | "skip";
  hard: boolean;
  detail: string;
};

const AXIS_OF: Record<string, AxisKey> = {
  sop_filter_1_legal: "eligibility",
  jurisdiction_required: "geography",
  jurisdiction_excluded: "geography",
  sectors_required: "sector",
  sectors_excluded: "sector",
  sop_filter_4_strategic: "sector",
  keywords_required: "sector",
  keywords_excluded: "sector",
  amount_min: "budget",
  amount_max: "budget",
  sop_filter_3_costshare: "budget",
  sop_filter_3_match_verify: "budget",
  sop_filter_5_runway: "timeline",
  deadline: "timeline",
};

const AXIS_LABELS: Record<AxisKey, string> = {
  eligibility: "Eligibility",
  geography: "Geographic fit",
  sector: "Mission & sector fit",
  budget: "Budget fit",
  timeline: "Timeline & runway",
  capacity: "Operational capacity",
};

const AXIS_ORDER: AxisKey[] = ["eligibility", "geography", "sector", "budget", "timeline"];

/**
 * Group the deterministic checks into named axes with a 0–10 sub-score each.
 * Pure: same checks → same breakdown. "warn"/"skip" count as not-evaluable so a
 * soft warning never fabricates a passing score.
 */
export function computeAxisBreakdown(checks: CheckLite[]): AxisScore[] {
  const byAxis = new Map<AxisKey, CheckLite[]>();
  for (const c of checks) {
    const axis = AXIS_OF[c.id];
    if (!axis) continue;
    (byAxis.get(axis) ?? byAxis.set(axis, []).get(axis)!).push(c);
  }

  return AXIS_ORDER.map((axis) => {
    const list = byAxis.get(axis) ?? [];
    const evaluable = list.filter((c) => c.status === "pass" || c.status === "fail");
    const passed = evaluable.filter((c) => c.status === "pass").length;
    const hardFail = list.some((c) => c.status === "fail" && c.hard);
    const score = evaluable.length === 0 ? null : Math.round((passed / evaluable.length) * 10);
    const status: AxisScore["status"] =
      evaluable.length === 0
        ? "na"
        : passed === evaluable.length
          ? "pass"
          : passed === 0
            ? "fail"
            : "partial";
    return {
      axis,
      label: AXIS_LABELS[axis],
      score,
      status,
      reasons: list.map((c) => c.detail).filter(Boolean),
      hardFail,
    };
  });
}

/**
 * Operational-capacity signal: can the org realistically manage & co-fund a
 * grant of this size given its annual budget? This is the "operational capacity"
 * / "historical funding size" dimension the best tools score (FundRobin,
 * Grantable) and the strongest guard against the market's #1 weakness —
 * surfacing grants an org is eligible for but can't actually deliver.
 *
 * Advisory only (never a hard-fail). Returns null (N/A) when either figure is
 * unknown — we never fabricate a capacity score from missing data.
 *
 * Bands by grant-amount / annual-budget ratio (grant mgmt reality: orgs comfortably
 * run projects up to ~1× budget; beyond ~5× the co-fund/admin load exceeds capacity):
 *   ratio ≤ 1        → 10  fully within capacity
 *   1 < ratio ≤ 3    → 7   manageable with effort
 *   3 < ratio ≤ 5    → 4   stretch
 *   ratio > 5        → 1   likely exceeds capacity (soft warn)
 * A grant < 2% of annual budget is flagged as low-ROI-on-effort (still scored 8).
 */
export function assessBudgetCapacity(
  orgAnnualBudgetCad: number | null | undefined,
  grantMinCad: number | null | undefined,
  grantMaxCad: number | null | undefined,
): AxisScore {
  const budget =
    typeof orgAnnualBudgetCad === "number" && orgAnnualBudgetCad > 0 ? orgAnnualBudgetCad : null;
  const amount =
    typeof grantMaxCad === "number" && grantMaxCad > 0
      ? grantMaxCad
      : typeof grantMinCad === "number" && grantMinCad > 0
        ? grantMinCad
        : null;

  if (budget == null || amount == null) {
    return {
      axis: "capacity",
      label: AXIS_LABELS.capacity,
      score: null,
      status: "na",
      reasons: [
        budget == null
          ? "Org annual budget unknown — capacity not assessed"
          : "Grant amount unknown — capacity not assessed",
      ],
      hardFail: false,
    };
  }

  const ratio = amount / budget;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  let score: number;
  let reason: string;
  if (ratio <= 1) {
    score = 10;
    reason = `Grant (${fmt(amount)}) is within the org's annual budget (${fmt(budget)}) — fully manageable`;
  } else if (ratio <= 3) {
    score = 7;
    reason = `Grant (${fmt(amount)}) is ${ratio.toFixed(1)}× the annual budget — manageable with effort`;
  } else if (ratio <= 5) {
    score = 4;
    reason = `Grant (${fmt(amount)}) is ${ratio.toFixed(1)}× the annual budget — a capacity stretch`;
  } else {
    score = 1;
    reason = `Grant (${fmt(amount)}) is ${ratio.toFixed(1)}× the annual budget — likely exceeds capacity to manage/co-fund`;
  }
  const reasons = [reason];
  if (amount < budget * 0.02) {
    score = Math.min(score, 8);
    reasons.push(`Grant is under 2% of annual budget — low return on application effort`);
  }

  return {
    axis: "capacity",
    label: AXIS_LABELS.capacity,
    score,
    status: score >= 7 ? "pass" : score >= 4 ? "partial" : "fail",
    reasons,
    hardFail: false,
  };
}

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
