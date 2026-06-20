// Deterministic fit-rules engine.
// Pure functions — no IO. Used by evaluator and by the rules preview UI.

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
};

export const DEFAULT_RULES: FitRules = {
  min_amount_cad: null,
  max_amount_cad: null,
  required_jurisdictions: [],
  excluded_jurisdictions: [],
  required_sectors: [],
  excluded_sectors: [],
  required_keywords: [],
  excluded_keywords: [],
  min_days_to_deadline: null,
  weight_llm: 0.5,
  threshold_fit_pass: 60,
  hard_fail_on_jurisdiction: true,
  hard_fail_on_excluded_keyword: true,
  hard_fail_on_amount: false,
  hard_fail_on_deadline: false,
  auto_archive_on_fail: true,
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
  rule_score: number; // 0..100 share of soft-checks that pass
  combined_score: (llmScore: number) => number;
  pass: (llmScore: number) => boolean;
};

const norm = (s: string) => s.trim().toLowerCase();
const overlap = (a: string[], b: string[]) => {
  const set = new Set(a.map(norm));
  return b.some((x) => set.has(norm(x)));
};
const containsAny = (hay: string, kws: string[]) =>
  kws.some((k) => hay.includes(norm(k)));
const containsAll = (hay: string, kws: string[]) =>
  kws.every((k) => hay.includes(norm(k)));

export function evaluateRules(rules: FitRules, g: GrantForRules): RulesResult {
  const checks: RuleCheck[] = [];
  const grantSectors = (g.sectors ?? []).filter(Boolean);
  const grantCountry = (g.country ?? "").trim();
  const eligibilityText = norm(
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

  // Jurisdiction required
  if (rules.required_jurisdictions.length > 0) {
    const ok = grantCountry
      ? rules.required_jurisdictions.map(norm).includes(norm(grantCountry))
      : false;
    checks.push({
      id: "jurisdiction_required",
      label: "Jurisdicción requerida",
      status: ok ? "pass" : "fail",
      hard: rules.hard_fail_on_jurisdiction,
      detail: ok
        ? `${grantCountry} ∈ {${rules.required_jurisdictions.join(", ")}}`
        : `${grantCountry || "(sin país)"} no está en {${rules.required_jurisdictions.join(", ")}}`,
    });
  }

  // Jurisdiction excluded
  if (rules.excluded_jurisdictions.length > 0 && grantCountry) {
    const bad = rules.excluded_jurisdictions.map(norm).includes(norm(grantCountry));
    checks.push({
      id: "jurisdiction_excluded",
      label: "Jurisdicción excluida",
      status: bad ? "fail" : "pass",
      hard: rules.hard_fail_on_jurisdiction,
      detail: bad ? `${grantCountry} está excluido` : `${grantCountry} no está excluido`,
    });
  }

  // Sectors required (any overlap)
  if (rules.required_sectors.length > 0) {
    const ok = overlap(rules.required_sectors, grantSectors);
    checks.push({
      id: "sectors_required",
      label: "Sectores requeridos",
      status: ok ? "pass" : "fail",
      hard: false,
      detail: ok
        ? `intersección con {${rules.required_sectors.join(", ")}}`
        : `grant=[${grantSectors.join(", ") || "—"}] sin intersección con [${rules.required_sectors.join(", ")}]`,
    });
  }

  // Sectors excluded
  if (rules.excluded_sectors.length > 0 && grantSectors.length > 0) {
    const bad = overlap(rules.excluded_sectors, grantSectors);
    checks.push({
      id: "sectors_excluded",
      label: "Sectores excluidos",
      status: bad ? "fail" : "pass",
      hard: false,
      detail: bad
        ? `grant incluye sector excluido`
        : `ningún sector excluido presente`,
    });
  }

  // Amount min
  if (rules.min_amount_cad !== null) {
    const max = g.amount_cad_max ?? g.amount_cad_min ?? null;
    if (max === null) {
      checks.push({
        id: "amount_min",
        label: `Monto ≥ $${rules.min_amount_cad.toLocaleString()}`,
        status: "skip",
        hard: rules.hard_fail_on_amount,
        detail: "monto del grant desconocido",
      });
    } else {
      const ok = max >= rules.min_amount_cad;
      checks.push({
        id: "amount_min",
        label: `Monto ≥ $${rules.min_amount_cad.toLocaleString()}`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_amount,
        detail: `máx grant = $${max.toLocaleString()}`,
      });
    }
  }

  // Amount max
  if (rules.max_amount_cad !== null) {
    const min = g.amount_cad_min ?? g.amount_cad_max ?? null;
    if (min === null) {
      checks.push({
        id: "amount_max",
        label: `Monto ≤ $${rules.max_amount_cad.toLocaleString()}`,
        status: "skip",
        hard: rules.hard_fail_on_amount,
        detail: "monto del grant desconocido",
      });
    } else {
      const ok = min <= rules.max_amount_cad;
      checks.push({
        id: "amount_max",
        label: `Monto ≤ $${rules.max_amount_cad.toLocaleString()}`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_amount,
        detail: `mín grant = $${min.toLocaleString()}`,
      });
    }
  }

  // Deadline
  if (rules.min_days_to_deadline !== null) {
    if (!g.deadline) {
      checks.push({
        id: "deadline",
        label: `≥ ${rules.min_days_to_deadline} días hasta deadline`,
        status: "skip",
        hard: rules.hard_fail_on_deadline,
        detail: "sin deadline",
      });
    } else {
      const days = Math.floor(
        (new Date(g.deadline).getTime() - Date.now()) / 86400000,
      );
      const ok = days >= rules.min_days_to_deadline;
      checks.push({
        id: "deadline",
        label: `≥ ${rules.min_days_to_deadline} días hasta deadline`,
        status: ok ? "pass" : "fail",
        hard: rules.hard_fail_on_deadline,
        detail: `quedan ${days} días`,
      });
    }
  }

  // Required keywords (all must appear)
  if (rules.required_keywords.length > 0) {
    const ok = containsAll(eligibilityText, rules.required_keywords);
    checks.push({
      id: "keywords_required",
      label: "Keywords requeridas",
      status: ok ? "pass" : "fail",
      hard: false,
      detail: ok
        ? `todas presentes: ${rules.required_keywords.join(", ")}`
        : `falta alguna de: ${rules.required_keywords.join(", ")}`,
    });
  }

  // Excluded keywords (none must appear)
  if (rules.excluded_keywords.length > 0) {
    const bad = containsAny(eligibilityText, rules.excluded_keywords);
    checks.push({
      id: "keywords_excluded",
      label: "Keywords excluyentes",
      status: bad ? "fail" : "pass",
      hard: rules.hard_fail_on_excluded_keyword,
      detail: bad
        ? `aparece alguna de: ${rules.excluded_keywords.join(", ")}`
        : "ninguna keyword excluyente presente",
    });
  }

  const hard_fail = checks.some((c) => c.status === "fail" && c.hard);
  const evaluable = checks.filter((c) => c.status === "pass" || c.status === "fail");
  const passed = evaluable.filter((c) => c.status === "pass").length;
  const rule_score = evaluable.length === 0 ? 100 : Math.round((passed / evaluable.length) * 100);

  const w = rules.weight_llm;
  const combined_score = (llm: number) => Math.round(w * llm + (1 - w) * rule_score);
  const pass = (llm: number) => !hard_fail && combined_score(llm) >= rules.threshold_fit_pass;

  return { checks, hard_fail, rule_score, combined_score, pass };
}
