export type SearchProfileForRanking = {
  mission: string;
  activities: string[];
  populations_served: string[];
  funding_uses: string[];
  sectors: string[];
  jurisdictions: string[];
  applicant_types: string[];
  amount_min_cad: number | null;
  amount_max_cad: number | null;
  required_terms: string[];
  excluded_terms: string[];
};

export type GrantForProfileRanking = {
  title: string;
  title_fr: string | null;
  summary: string | null;
  summary_fr: string | null;
  sectors: string[] | null;
  amount_cad_min: number | null;
  amount_cad_max: number | null;
  funder?: { jurisdiction?: string | null } | null;
};

export type ProfileMatch = {
  score: number;
  hardBlocked: boolean;
  matched: string[];
  missing: string[];
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const includesTerm = (haystack: string, term: string) => {
  const needle = normalize(term);
  return (
    needle.length > 1 && (` ${haystack} `.includes(` ${needle} `) || haystack.includes(needle))
  );
};

const overlap = (left: string[], right: string[]) => {
  const normalizedRight = right.map(normalize);
  return left.filter((item) => {
    const value = normalize(item);
    return normalizedRight.some(
      (candidate) => candidate === value || candidate.includes(value) || value.includes(candidate),
    );
  });
};

export function scoreGrantForProfile(
  grant: GrantForProfileRanking,
  profile: SearchProfileForRanking,
): ProfileMatch {
  const text = normalize(
    [grant.title, grant.title_fr, grant.summary, grant.summary_fr, ...(grant.sectors ?? [])]
      .filter(Boolean)
      .join(" "),
  );
  const excluded = profile.excluded_terms.filter((term) => includesTerm(text, term));
  const missingRequired = profile.required_terms.filter((term) => !includesTerm(text, term));
  if (excluded.length || missingRequired.length) {
    return {
      score: 0,
      hardBlocked: true,
      matched: excluded.map((term) => `excluded:${term}`),
      missing: missingRequired.map((term) => `required:${term}`),
    };
  }

  let earned = 0;
  let possible = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  const scoreTerms = (label: string, terms: string[], weight: number) => {
    if (!terms.length) return;
    possible += weight;
    const hits = terms.filter((term) => includesTerm(text, term));
    if (hits.length) {
      earned += weight * Math.min(1, hits.length / Math.min(3, terms.length));
      matched.push(`${label}:${hits.join(", ")}`);
    } else missing.push(label);
  };

  scoreTerms("activity", profile.activities, 20);
  scoreTerms("population", profile.populations_served, 20);
  scoreTerms("funding_use", profile.funding_uses, 20);
  scoreTerms(
    "mission",
    profile.mission
      .split(/\s+/)
      .map(normalize)
      .filter((term) => term.length > 2),
    20,
  );

  if (profile.sectors.length) {
    possible += 15;
    const hits = overlap(profile.sectors, grant.sectors ?? []);
    if (hits.length) {
      earned += 15;
      matched.push(`sector:${hits.join(", ")}`);
    } else missing.push("sector");
  }

  if (profile.jurisdictions.length) {
    possible += 10;
    const jurisdiction = grant.funder?.jurisdiction ?? "";
    const applies = profile.jurisdictions.some((item) => {
      const expected = normalize(item);
      const actual = normalize(jurisdiction);
      return expected === "ca" || expected === "canada" || actual.includes(expected);
    });
    if (applies) {
      earned += 10;
      matched.push(`jurisdiction:${jurisdiction || "Canada"}`);
    } else missing.push("jurisdiction");
  }

  if (profile.amount_min_cad != null || profile.amount_max_cad != null) {
    possible += 5;
    const grantMin = grant.amount_cad_min ?? grant.amount_cad_max;
    const grantMax = grant.amount_cad_max ?? grant.amount_cad_min;
    const overlaps =
      grantMin != null &&
      grantMax != null &&
      (profile.amount_max_cad == null || grantMin <= profile.amount_max_cad) &&
      (profile.amount_min_cad == null || grantMax >= profile.amount_min_cad);
    if (overlaps) {
      earned += 5;
      matched.push("amount");
    } else missing.push("amount");
  }

  return {
    score: possible ? Math.round((earned / possible) * 100) : 50,
    hardBlocked: false,
    matched,
    missing,
  };
}
