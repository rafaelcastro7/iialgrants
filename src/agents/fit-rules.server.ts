// Deterministic fit-rules engine — IIAL SOP edition.
// Pure functions — no IO. Used by evaluator and by the rules preview UI.
// Implements the auto-evaluable filters from the IIAL Grant Finding SOP v2:
//   Filter 1 — Legal eligibility (applicant types)
//   Filter 3 — Money math (amount range + cost-share cap)
//   Filter 4 — Strategic fit (IIAL capabilities ↔ grant sectors/eligibility)
//   Filter 5 — Runway (min weeks before deadline, by role)
// Filter 2 (role triage) and Filter 6 (effort vs win) are surfaced for human
// review in the Opportunity Brief — not auto-gated.

export type FitRules = {
  // Generic
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
  // SOP-IIAL
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

// IIAL defaults straight from SOP v2.
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
  // SOP — Filter 1
  applicant_types_allowed: ["nonprofit", "non-profit", "not-for-profit"],
  applicant_types_excluded: ["charity_only", "municipality_only", "university_only", "individual_only", "for_profit_only"],
  // SOP — Filter 5
  lead_min_weeks: 4,
  partner_min_weeks: 8,
  // SOP — Filter 4 (IIAL capabilities)
  iial_capabilities: [
    "supply chain", "wcis", "traceability",
    "certification", "micro-credential", "microcredential",
    "applied research", "feasibility",
    "smart city", "aiot", "iot",
    "climate", "sustainability",
    "international development",
  ],
  // SOP — Filter 3
  max_cost_share_pct_org_carries: 50,
  require_match_verification: true,
  rolling_intake_passes_runway: true,
  hard_fail_on_applicant_type: true,
  hard_fail_on_runway: true,
  hard_fail_on_capability: false,
};

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
  // SOP brief inputs (derived)
  detected_role: "lead" | "partner" | "unknown";
  cost_share_pct: number | null;
  rolling_intake: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();
const overlap = (a: string[], b: string[]) => {
  const set = new Set(a.map(norm));
  return b.some((x) => set.has(norm(x)));
};
const containsAny = (hay: string, kws: string[]) => kws.some((k) => hay.includes(norm(k)));
const containsAll = (hay: string, kws: string[]) => kws.every((k) => hay.includes(norm(k)));

function buildHaystack(g: GrantForRules): string {
  return norm(
    [
      typeof g.eligibility === "string" ? g.eligibility : g.eligibility ? JSON.stringify(g.eligibility) : "",
      g.summary ?? "", g.title ?? "",
    ].join(" "),
  );
}

// SOP Filter 2 detection — does the program mention IIAL's likely role?
function detectRole(hay: string): "lead" | "partner" | "unknown" {
  const partner = /\b(municipal(ity|ities)?|city of|town of|first nation|partner|co-?applicant|lead applicant must be)\b/.test(hay);
  const lead = /\b(non[- ]?profit|charity|organization|business|smes?|enterprise)\b/.test(hay);
  if (partner && !lead) return "partner";
  if (lead && !partner) return "lead";
  if (partner && lead) return "partner"; // safer: assume partner pathway
  return "unknown";
}

// SOP Filter 3 detection — cost-share %.
function detectCostShare(hay: string): number | null {
  // "covers 80%", "up to 75%", "50% match", "80/20"
  const m =
    hay.match(/\b(?:cover|covers|funds|funded at|up to|reimburses)\s+(\d{1,3})\s*%/) ||
    hay.match(/\b(\d{1,3})\s*%\s*(?:cost[- ]?share|match|contribution|funding|grant)/) ||
    hay.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (!m) return null;
  if (m[2] && Number(m[1]) + Number(m[2]) === 100) return 100 - Number(m[1]); // 80/20
  const n = Number(m[1]);
  if (n >= 0 && n <= 100) return 100 - n; // grant covers X% → org carries 100-X
  return null;
}

function isRollingIntake(hay: string, deadline?: string | null): boolean {
  if (!deadline) return /\b(rolling|continuous|ongoing|open intake|no deadline|anytime)\b/.test(hay);
  return false;
}

function detectExcludedApplicantTypes(hay: string): string[] {
  const out: string[] = [];
  // "open only to charities", "must be a registered charity", "municipalities only"
  if (/\b(?:only|must be|restricted to|eligible (?:are |applicants? (?:are |include )))[^.]{0,80}\b(registered )?charit(y|ies)\b/.test(hay)) out.push("charity_only");
  if (/\b(?:only|must be|restricted to|eligible (?:are |applicants? (?:are |include )))[^.]{0,80}\b(municipalit(y|ies)|local government)\b/.test(hay)) out.push("municipality_only");
  if (/\b(?:only|must be|restricted to|eligible (?:are |applicants? (?:are |include )))[^.]{0,80}\b(universit(y|ies)|colleges?|post[- ]secondary)\b/.test(hay)) out.push("university_only");
  if (/\b(?:only|must be)[^.]{0,80}\b(individuals?|private citizens?)\b/.test(hay)) out.push("individual_only");
  if (/\b(?:only|must be|restricted to)[^.]{0,80}\b(for[- ]profit|commercial)\b/.test(hay)) out.push("for_profit_only");
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

  // ---- Filter 1 — Legal eligibility (applicant types) ----
  if (rules.applicant_types_excluded.length > 0) {
    const detected = detectExcludedApplicantTypes(hay);
    const bad = detected.filter((d) => rules.applicant_types_excluded.includes(d));
    if (detected.length > 0) {
      checks.push({
        id: "sop_filter_1_legal",
        label: "SOP F1 · Elegibilidad legal",
        status: bad.length > 0 ? "fail" : "pass",
        hard: rules.hard_fail_on_applicant_type,
        detail: bad.length > 0
          ? `programa restringido a: ${bad.join(", ")}`
          : `restricciones detectadas (${detected.join(", ")}) no excluyentes`,
      });
    }
  }

  // ---- Generic jurisdiction ----
  if (rules.required_jurisdictions.length > 0) {
    const ok = grantCountry ? rules.required_jurisdictions.map(norm).includes(norm(grantCountry)) : false;
    checks.push({
      id: "jurisdiction_required", label: "Jurisdicción requerida",
      status: ok ? "pass" : "fail", hard: rules.hard_fail_on_jurisdiction,
      detail: ok
        ? `${grantCountry} ∈ {${rules.required_jurisdictions.join(", ")}}`
        : `${grantCountry || "(sin país)"} no está en {${rules.required_jurisdictions.join(", ")}}`,
    });
  }
  if (rules.excluded_jurisdictions.length > 0 && grantCountry) {
    const bad = rules.excluded_jurisdictions.map(norm).includes(norm(grantCountry));
    checks.push({
      id: "jurisdiction_excluded", label: "Jurisdicción excluida",
      status: bad ? "fail" : "pass", hard: rules.hard_fail_on_jurisdiction,
      detail: bad ? `${grantCountry} está excluido` : `${grantCountry} no está excluido`,
    });
  }

  // ---- Generic sectors ----
  if (rules.required_sectors.length > 0) {
    const ok = overlap(rules.required_sectors, grantSectors);
    checks.push({
      id: "sectors_required", label: "Sectores requeridos",
      status: ok ? "pass" : "fail", hard: false,
      detail: ok ? `intersección con {${rules.required_sectors.join(", ")}}`
        : `grant=[${grantSectors.join(", ") || "—"}] sin intersección con [${rules.required_sectors.join(", ")}]`,
    });
  }
  if (rules.excluded_sectors.length > 0 && grantSectors.length > 0) {
    const bad = overlap(rules.excluded_sectors, grantSectors);
    checks.push({
      id: "sectors_excluded", label: "Sectores excluidos",
      status: bad ? "fail" : "pass", hard: false,
      detail: bad ? `grant incluye sector excluido` : `ningún sector excluido presente`,
    });
  }

  // ---- Filter 4 — Strategic fit (IIAL capabilities) ----
  if (rules.iial_capabilities.length > 0) {
    const hits = rules.iial_capabilities.filter((c) => hay.includes(norm(c)));
    const ok = hits.length > 0;
    checks.push({
      id: "sop_filter_4_strategic",
      label: "SOP F4 · Fit estratégico (capacidades IIAL)",
      status: ok ? "pass" : "fail",
      hard: rules.hard_fail_on_capability,
      detail: ok
        ? `coincide con: ${hits.join(", ")}`
        : `ninguna capacidad IIAL detectada en eligibility/summary`,
    });
  }

  // ---- Filter 3 — Money math ----
  if (rules.min_amount_cad !== null) {
    const max = g.amount_cad_max ?? g.amount_cad_min ?? null;
    if (max === null) {
      checks.push({ id: "amount_min", label: `Monto ≥ $${rules.min_amount_cad.toLocaleString()}`, status: "skip", hard: rules.hard_fail_on_amount, detail: "monto del grant desconocido" });
    } else {
      const ok = max >= rules.min_amount_cad;
      checks.push({ id: "amount_min", label: `Monto ≥ $${rules.min_amount_cad.toLocaleString()}`, status: ok ? "pass" : "fail", hard: rules.hard_fail_on_amount, detail: `máx grant = $${max.toLocaleString()}` });
    }
  }
  if (rules.max_amount_cad !== null) {
    const min = g.amount_cad_min ?? g.amount_cad_max ?? null;
    if (min === null) {
      checks.push({ id: "amount_max", label: `Monto ≤ $${rules.max_amount_cad.toLocaleString()}`, status: "skip", hard: rules.hard_fail_on_amount, detail: "monto del grant desconocido" });
    } else {
      const ok = min <= rules.max_amount_cad;
      checks.push({ id: "amount_max", label: `Monto ≤ $${rules.max_amount_cad.toLocaleString()}`, status: ok ? "pass" : "fail", hard: rules.hard_fail_on_amount, detail: `mín grant = $${min.toLocaleString()}` });
    }
  }
  if (rules.max_cost_share_pct_org_carries !== null && cost_share_pct !== null) {
    const ok = cost_share_pct <= rules.max_cost_share_pct_org_carries;
    checks.push({
      id: "sop_filter_3_costshare",
      label: `SOP F3 · Cost-share org ≤ ${rules.max_cost_share_pct_org_carries}%`,
      status: ok ? "pass" : "fail",
      hard: false,
      detail: `org carga ~${cost_share_pct}%`,
    });
  }
  if (rules.require_match_verification && cost_share_pct !== null && cost_share_pct > 0) {
    checks.push({
      id: "sop_filter_3_match_verify",
      label: "SOP F3 · Verificar disponibilidad de cash match",
      status: "warn", hard: false,
      detail: `requiere ~${cost_share_pct}% de contribución — confirmar con liderazgo`,
    });
  }

  // ---- Filter 5 — Runway by role ----
  const wantWeeks = detected_role === "partner"
    ? rules.partner_min_weeks
    : detected_role === "lead"
      ? rules.lead_min_weeks
      : (rules.partner_min_weeks ?? rules.lead_min_weeks); // unknown → stricter

  if (wantWeeks !== null && wantWeeks !== undefined) {
    if (rolling_intake && rules.rolling_intake_passes_runway) {
      checks.push({ id: "sop_filter_5_runway", label: `SOP F5 · Runway ≥ ${wantWeeks}w`, status: "pass", hard: rules.hard_fail_on_runway, detail: "rolling intake → pase automático" });
    } else if (!g.deadline) {
      checks.push({ id: "sop_filter_5_runway", label: `SOP F5 · Runway ≥ ${wantWeeks}w`, status: "skip", hard: rules.hard_fail_on_runway, detail: "sin deadline" });
    } else {
      const days = Math.floor((new Date(g.deadline).getTime() - Date.now()) / 86400000);
      const weeks = Math.floor(days / 7);
      const ok = weeks >= wantWeeks;
      checks.push({
        id: "sop_filter_5_runway",
        label: `SOP F5 · Runway ≥ ${wantWeeks}w (rol: ${detected_role})`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_runway,
        detail: `quedan ${weeks} semanas (${days} días)`,
      });
    }
  }

  // ---- Generic deadline ----
  if (rules.min_days_to_deadline !== null) {
    if (!g.deadline) {
      checks.push({ id: "deadline", label: `≥ ${rules.min_days_to_deadline} días hasta deadline`, status: "skip", hard: rules.hard_fail_on_deadline, detail: "sin deadline" });
    } else {
      const days = Math.floor((new Date(g.deadline).getTime() - Date.now()) / 86400000);
      const ok = days >= rules.min_days_to_deadline;
      checks.push({ id: "deadline", label: `≥ ${rules.min_days_to_deadline} días hasta deadline`, status: ok ? "pass" : "fail", hard: rules.hard_fail_on_deadline, detail: `quedan ${days} días` });
    }
  }

  // ---- Keywords ----
  if (rules.required_keywords.length > 0) {
    const ok = containsAll(hay, rules.required_keywords);
    checks.push({ id: "keywords_required", label: "Keywords requeridas", status: ok ? "pass" : "fail", hard: false, detail: ok ? `todas presentes: ${rules.required_keywords.join(", ")}` : `falta alguna de: ${rules.required_keywords.join(", ")}` });
  }
  if (rules.excluded_keywords.length > 0) {
    const bad = containsAny(hay, rules.excluded_keywords);
    checks.push({ id: "keywords_excluded", label: "Keywords excluyentes", status: bad ? "fail" : "pass", hard: rules.hard_fail_on_excluded_keyword, detail: bad ? `aparece alguna de: ${rules.excluded_keywords.join(", ")}` : "ninguna keyword excluyente presente" });
  }

  const hard_fail = checks.some((c) => c.status === "fail" && c.hard);
  const evaluable = checks.filter((c) => c.status === "pass" || c.status === "fail");
  const passed = evaluable.filter((c) => c.status === "pass").length;
  const rule_score = evaluable.length === 0 ? 100 : Math.round((passed / evaluable.length) * 100);

  // combined_score is on 0–100 scale. `llm` arrives in 0–1 (Evaluator schema),
  // so multiply by 100 before blending with rule_score (already 0–100).
  const w = rules.weight_llm;
  const combined_score = (llm: number) => Math.round(w * llm * 100 + (1 - w) * rule_score);
  const pass = (llm: number) => !hard_fail && combined_score(llm) >= rules.threshold_fit_pass;


  return { checks, hard_fail, rule_score, combined_score, pass, detected_role, cost_share_pct, rolling_intake };
}
