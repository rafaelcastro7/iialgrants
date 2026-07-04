// Deterministic fit-rules engine - IIAL SOP edition.
// Pure functions - no IO. Used by evaluator and by the rules preview UI.
// Implements the auto-evaluable filters from the IIAL Grant Finding SOP v2:
//   Filter 1 - Legal eligibility (applicant types)
//   Filter 3 - Money math (amount range + cost-share cap)
//   Filter 4 - Strategic fit (IIAL capabilities <-> grant sectors/eligibility)
//   Filter 5 - Runway (minimum weeks before deadline, by role)
// Filter 2 (role triage) and Filter 6 (effort vs win) are surfaced for human
// review in the Opportunity Brief - not auto-gated.

export type { FitRules, OrgProfileLite, AxisKey, AxisScore } from "@/agents/fit-rules.shared";
export {
  DEFAULT_RULES,
  deriveRulesFromOrg,
  computeAxisBreakdown,
  assessBudgetCapacity,
} from "@/agents/fit-rules.shared";

import type { FitRules } from "@/agents/fit-rules.shared";

export type GrantForRules = {
  amount_cad_min?: number | null;
  amount_cad_max?: number | null;
  deadline?: string | null;
  eligibility?: unknown;
  sectors?: string[] | null;
  country?: string | null;
  summary?: string | null;
  title?: string | null;
};

export type RuleCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn" | "skip";
  hard: boolean;
  detail: string;
};

export type RulesResult = {
  checks: RuleCheck[];
  hard_fail: boolean;
  rule_score: number;
  combined_score: (llmScore: number) => number;
  pass: (llmScore: number) => boolean;
  detected_role: "lead" | "partner" | "unknown";
  cost_share_pct: number | null;
  rolling_intake: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();
const overlap = (a: string[], b: string[]) => {
  const set = new Set(a.map(norm));
  return b.some((x) => set.has(norm(x)));
};
// Word-boundary matching to avoid false positives (e.g. "art" in "chart", "start").
const containsAny = (hay: string, kws: string[]) =>
  kws.some((k) =>
    new RegExp(
      `(?:^|[\\s,;:.()\\-])${norm(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s,;:.()\\-])`,
    ).test(hay),
  );
const containsAll = (hay: string, kws: string[]) =>
  kws.every((k) =>
    new RegExp(
      `(?:^|[\\s,;:.()\\-])${norm(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s,;:.()\\-])`,
    ).test(hay),
  );

// Normalize jurisdiction variants to ISO-2 codes for matching.
const JURISDICTION_ALIASES: Record<string, string> = {
  canada: "ca",
  canadian: "ca",
  ca: "ca",
  ontario: "on",
  on: "on",
  quebec: "qc",
  québec: "qc",
  qc: "qc",
  "british columbia": "bc",
  bc: "bc",
  alberta: "ab",
  ab: "ab",
  manitoba: "mb",
  mb: "mb",
  saskatchewan: "sk",
  sk: "sk",
  "nova scotia": "ns",
  ns: "ns",
  "new brunswick": "nb",
  nb: "nb",
  newfoundland: "nl",
  "newfoundland and labrador": "nl",
  nl: "nl",
  "prince edward island": "pe",
  pei: "pe",
  pe: "pe",
  territories: "yt",
  yukon: "yt",
  nwt: "nt",
  nunavut: "nu",
  national: "ca",
  federal: "ca",
  "pan-canadian": "ca",
  "all provinces": "ca",
  nationwide: "ca",
};
function normalizeJurisdiction(raw: string): string {
  const n = norm(raw);
  return JURISDICTION_ALIASES[n] ?? n;
}

function buildHaystack(g: GrantForRules): string {
  return norm(
    [
      typeof g.eligibility === "string"
        ? g.eligibility
        : g.eligibility
          ? JSON.stringify(g.eligibility)
          : "",
      g.summary ?? "",
      g.title ?? "",
    ].join(" "),
  );
}

function detectRole(hay: string): "lead" | "partner" | "unknown" {
  const partner =
    /\b(municipal(ity|ities)?|city of|town of|first nation|partner|co-?applicant|lead applicant must be)\b/.test(
      hay,
    );
  const lead = /\b(non[- ]?profit|charity|organization|business|smes?|enterprise)\b/.test(hay);
  if (partner && !lead) return "partner";
  if (lead && !partner) return "lead";
  if (partner && lead) return "lead"; // prefer lead when both signals (IIAL is an org)
  return "unknown";
}

function detectCostShare(hay: string): number | null {
  const m =
    hay.match(/\b(?:cover|covers|funds|funded at|up to|reimburses)\s+(\d{1,3})\s*%/) ||
    hay.match(/\b(\d{1,3})\s*%\s*(?:cost[- ]?share|match|contribution|funding|grant)/) ||
    hay.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (!m) return null;
  if (m[2]) {
    const a = Number(m[1]),
      b = Number(m[2]);
    if (a + b === 100) return 100 - a;
    if (a + b > 0) return Math.round((b / (a + b)) * 100);
  }
  const n = Number(m[1]);
  if (n >= 0 && n <= 100) return 100 - n;
  return null;
}

function isRollingIntake(hay: string, deadline?: string | null): boolean {
  // Detect rolling intake regardless of deadline — text explicitly saying
  // "rolling intake" or "continuous" overrides any deadline presence.
  return (
    /\b(rolling\s+intake|rolling\s+application|continuous\s+intake|ongoing|open\s+intake|accepting\s+applications\s+on\s+an?\s+ongoing)\b/.test(
      hay,
    ) ||
    (!deadline && /\b(rolling|no deadline|anytime)\b/.test(hay))
  );
}

function detectExcludedApplicantTypes(hay: string): string[] {
  const out: string[] = [];
  if (
    /\b(?:only|must be|restricted to|eligible (?:are |applicants? (?:are |include )))[^.]{0,80}\b(registered )?charit(y|ies)\b/.test(
      hay,
    )
  ) {
    out.push("charity_only");
  }
  if (
    /\b(?:only|must be|restricted to|eligible (?:are |applicants? (?:are |include )))[^.]{0,80}\b(municipalit(y|ies)|local government)\b/.test(
      hay,
    )
  ) {
    out.push("municipality_only");
  }
  if (
    /\b(?:only|must be|restricted to|eligible (?:are |applicants? (?:are |include )))[^.]{0,80}\b(universit(y|ies)|colleges?|post[- ]secondary)\b/.test(
      hay,
    )
  ) {
    out.push("university_only");
  }
  if (/\b(?:only|must be)[^.]{0,80}\b(individuals?|private citizens?)\b/.test(hay)) {
    out.push("individual_only");
  }
  if (/\b(?:only|must be|restricted to)[^.]{0,80}\b(for[- ]profit|commercial)\b/.test(hay)) {
    out.push("for_profit_only");
  }
  return out;
}

export function evaluateRules(rules: FitRules, g: GrantForRules): RulesResult {
  const checks: RuleCheck[] = [];
  const grantSectors = (g.sectors ?? []).filter(Boolean);
  const grantCountry = (g.country ?? "").trim();
  const hay = buildHaystack(g);
  const detected_role = detectRole(hay);
  const cost_share_pct = detectCostShare(hay);
  const rolling_intake = isRollingIntake(hay, g.deadline);

  if (rules.applicant_types_excluded.length > 0) {
    const detected = detectExcludedApplicantTypes(hay);
    const bad = detected.filter((d) => rules.applicant_types_excluded.includes(d));
    if (detected.length > 0) {
      checks.push({
        id: "sop_filter_1_legal",
        label: "SOP F1 - Legal eligibility",
        status: bad.length > 0 ? "fail" : "pass",
        hard: rules.hard_fail_on_applicant_type,
        detail:
          bad.length > 0
            ? `Program is restricted to: ${bad.join(", ")}`
            : `Restrictions detected (${detected.join(", ")}) but none are excluded`,
      });
    }
  }

  if (rules.required_jurisdictions.length > 0) {
    const normGrant = grantCountry ? normalizeJurisdiction(grantCountry) : "";
    const ok = normGrant
      ? rules.required_jurisdictions.map(normalizeJurisdiction).includes(normGrant)
      : false;
    checks.push({
      id: "jurisdiction_required",
      label: "Required jurisdiction",
      status: ok ? "pass" : "fail",
      hard: rules.hard_fail_on_jurisdiction,
      detail: ok
        ? `${grantCountry} is in {${rules.required_jurisdictions.join(", ")}}`
        : `${grantCountry || "(no country)"} is not in {${rules.required_jurisdictions.join(", ")}}`,
    });
  }

  if (rules.excluded_jurisdictions.length > 0 && grantCountry) {
    const normGrant = normalizeJurisdiction(grantCountry);
    const bad = rules.excluded_jurisdictions.map(normalizeJurisdiction).includes(normGrant);
    checks.push({
      id: "jurisdiction_excluded",
      label: "Excluded jurisdiction",
      status: bad ? "fail" : "pass",
      hard: rules.hard_fail_on_jurisdiction,
      detail: bad ? `${grantCountry} is excluded` : `${grantCountry} is not excluded`,
    });
  }

  if (rules.required_sectors.length > 0) {
    const ok = overlap(rules.required_sectors, grantSectors);
    checks.push({
      id: "sectors_required",
      label: "Required sectors",
      status: ok ? "pass" : "fail",
      hard: false,
      detail: ok
        ? `Overlap found with {${rules.required_sectors.join(", ")}}`
        : `Grant sectors [${grantSectors.join(", ") || "none"}] do not overlap with [${rules.required_sectors.join(", ")}]`,
    });
  }

  if (rules.excluded_sectors.length > 0 && grantSectors.length > 0) {
    const bad = overlap(rules.excluded_sectors, grantSectors);
    checks.push({
      id: "sectors_excluded",
      label: "Excluded sectors",
      status: bad ? "fail" : "pass",
      hard: false,
      detail: bad ? "Grant includes an excluded sector" : "No excluded sector detected",
    });
  }

  if (rules.iial_capabilities.length > 0) {
    const hits = rules.iial_capabilities.filter((c) => hay.includes(norm(c)));
    const ok = hits.length > 0;
    checks.push({
      id: "sop_filter_4_strategic",
      label: "SOP F4 - Strategic fit (IIAL capabilities)",
      status: ok ? "pass" : "fail",
      hard: rules.hard_fail_on_capability,
      detail: ok
        ? `Matched capabilities: ${hits.join(", ")}`
        : "No IIAL capability detected in eligibility or summary",
    });
  }

  if (rules.min_amount_cad !== null) {
    const max = g.amount_cad_max ?? g.amount_cad_min ?? null;
    if (max === null) {
      checks.push({
        id: "amount_min",
        label: `Amount >= $${rules.min_amount_cad.toLocaleString()}`,
        status: "skip",
        hard: rules.hard_fail_on_amount,
        detail: "Grant amount is unknown",
      });
    } else {
      const ok = max >= rules.min_amount_cad;
      checks.push({
        id: "amount_min",
        label: `Amount >= $${rules.min_amount_cad.toLocaleString()}`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_amount,
        detail: `Grant max = $${max.toLocaleString()}`,
      });
    }
  }

  if (rules.max_amount_cad !== null) {
    const min = g.amount_cad_min ?? g.amount_cad_max ?? null;
    if (min === null) {
      checks.push({
        id: "amount_max",
        label: `Amount <= $${rules.max_amount_cad.toLocaleString()}`,
        status: "skip",
        hard: rules.hard_fail_on_amount,
        detail: "Grant amount is unknown",
      });
    } else {
      const ok = min <= rules.max_amount_cad;
      checks.push({
        id: "amount_max",
        label: `Amount <= $${rules.max_amount_cad.toLocaleString()}`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_amount,
        detail: `Grant min = $${min.toLocaleString()}`,
      });
    }
  }

  if (rules.max_cost_share_pct_org_carries !== null && cost_share_pct !== null) {
    const ok = cost_share_pct <= rules.max_cost_share_pct_org_carries;
    checks.push({
      id: "sop_filter_3_costshare",
      label: `SOP F3 - Org cost share <= ${rules.max_cost_share_pct_org_carries}%`,
      status: ok ? "pass" : "fail",
      hard: false,
      detail: `Organization carries about ${cost_share_pct}%`,
    });
  }

  if (rules.require_match_verification && cost_share_pct !== null && cost_share_pct > 0) {
    checks.push({
      id: "sop_filter_3_match_verify",
      label: "SOP F3 - Verify cash-match availability",
      status: "warn",
      hard: false,
      detail: `Requires about ${cost_share_pct}% contribution - confirm with leadership`,
    });
  }

  const wantWeeks =
    detected_role === "partner"
      ? rules.partner_min_weeks
      : detected_role === "lead"
        ? rules.lead_min_weeks
        : (rules.partner_min_weeks ?? rules.lead_min_weeks);

  if (wantWeeks !== null && wantWeeks !== undefined) {
    if (rolling_intake && rules.rolling_intake_passes_runway) {
      checks.push({
        id: "sop_filter_5_runway",
        label: `SOP F5 - Runway >= ${wantWeeks}w`,
        status: "pass",
        hard: rules.hard_fail_on_runway,
        detail: "Rolling intake - automatic pass",
      });
    } else if (!g.deadline || Number.isNaN(new Date(g.deadline).getTime())) {
      checks.push({
        id: "sop_filter_5_runway",
        label: `SOP F5 - Runway >= ${wantWeeks}w`,
        status: "skip",
        hard: rules.hard_fail_on_runway,
        detail: "No deadline available",
      });
    } else {
      const days = Math.floor((new Date(g.deadline).getTime() - Date.now()) / 86400000);
      const weeks = Math.floor(days / 7);
      const ok = weeks >= wantWeeks;
      checks.push({
        id: "sop_filter_5_runway",
        label: `SOP F5 - Runway >= ${wantWeeks}w (role: ${detected_role})`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_runway,
        detail: `${weeks} week(s) remaining (${days} day(s))`,
      });
    }
  }

  if (rules.min_days_to_deadline !== null) {
    if (!g.deadline || Number.isNaN(new Date(g.deadline).getTime())) {
      checks.push({
        id: "deadline",
        label: `>= ${rules.min_days_to_deadline} days until deadline`,
        status: "skip",
        hard: rules.hard_fail_on_deadline,
        detail: "No deadline available",
      });
    } else {
      const days = Math.floor((new Date(g.deadline).getTime() - Date.now()) / 86400000);
      const ok = days >= rules.min_days_to_deadline;
      checks.push({
        id: "deadline",
        label: `>= ${rules.min_days_to_deadline} days until deadline`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_deadline,
        detail: `${days} day(s) remaining`,
      });
    }
  }

  if (rules.required_keywords.length > 0) {
    const ok = containsAll(hay, rules.required_keywords);
    checks.push({
      id: "keywords_required",
      label: "Required keywords",
      status: ok ? "pass" : "fail",
      hard: false,
      detail: ok
        ? `All present: ${rules.required_keywords.join(", ")}`
        : `Missing at least one of: ${rules.required_keywords.join(", ")}`,
    });
  }

  if (rules.excluded_keywords.length > 0) {
    const bad = containsAny(hay, rules.excluded_keywords);
    checks.push({
      id: "keywords_excluded",
      label: "Excluded keywords",
      status: bad ? "fail" : "pass",
      hard: rules.hard_fail_on_excluded_keyword,
      detail: bad
        ? `Contains at least one of: ${rules.excluded_keywords.join(", ")}`
        : "No excluded keywords detected",
    });
  }

  const hard_fail = checks.some((c) => c.status === "fail" && c.hard);
  const evaluable = checks.filter((c) => c.status === "pass" || c.status === "fail");
  const passed = evaluable.filter((c) => c.status === "pass").length;
  const rule_score = evaluable.length === 0 ? 50 : Math.round((passed / evaluable.length) * 100);

  const w = rules.weight_llm;
  const combined_score = (llm: number) => Math.round(w * llm * 100 + (1 - w) * rule_score);
  const pass = (llm: number) => !hard_fail && combined_score(llm) >= rules.threshold_fit_pass;

  return {
    checks,
    hard_fail,
    rule_score,
    combined_score,
    pass,
    detected_role,
    cost_share_pct,
    rolling_intake,
  };
}
