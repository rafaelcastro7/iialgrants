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
  max_cost_share_pct_org_carries: 0.50,
  require_match_verification: true,
  rolling_intake_passes_runway: true,
  hard_fail_on_applicant_type: true,
  hard_fail_on_runway: true,
  hard_fail_on_capability: false,
};
