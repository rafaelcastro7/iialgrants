export const GRANT_FACET_FIELDS = [
  "applicant_types",
  "populations_served",
  "funding_uses",
  "funder_type",
  "deadline_kind",
] as const;

export type GrantFacetField = (typeof GRANT_FACET_FIELDS)[number];
export type GrantFacetState = "known" | "unknown" | "conflicting";
export type GrantFacetEvidence = {
  id: string;
  field: string;
  value: unknown;
  confidence: number;
  source_url: string;
  snippet: string;
};

export type ResolvedGrantFacet = {
  field: GrantFacetField;
  state: GrantFacetState;
  values: string[];
  excludedValues: string[];
  confidence: number | null;
  evidence: GrantFacetEvidence[];
};

const ARRAY_FIELDS = new Set<GrantFacetField>([
  "applicant_types",
  "populations_served",
  "funding_uses",
]);

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Facet values are controlled labels, where punctuation is not semantic
// (`nonprofit`, `non-profit`, and `non profit` describe the same value).
const identity = (value: string) => normalize(value).replace(/\s+/g, "");

function stringsFrom(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringsFrom);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return stringsFrom(record.values ?? record.value);
}

function assertionFrom(value: unknown): "supports" | "excludes" {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "supports";
  const assertion = (value as Record<string, unknown>).assertion;
  return assertion === "excludes" ? "excludes" : "supports";
}

function unique(values: string[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const value of values) {
    const key = identity(value);
    if (key && !byNormalized.has(key)) byNormalized.set(key, value.trim());
  }
  return [...byNormalized.values()];
}

/**
 * Resolve a canonical facet only from explicit evidence assertions.
 *
 * A populated display column without evidence remains `unknown`: legacy text
 * is useful to show, but it is not proof. Negative assertions must be encoded
 * explicitly as `{ assertion: "excludes", values: [...] }`; mere mentions do
 * not become exclusions.
 */
export function resolveGrantFacet(input: {
  field: GrantFacetField;
  canonicalValue?: string | string[] | null;
  evidence: GrantFacetEvidence[];
}): ResolvedGrantFacet {
  const applicable = input.evidence.filter(
    (row) => row.field === input.field || row.field === `facet.${input.field}`,
  );
  const supported = unique(
    applicable
      .filter((row) => assertionFrom(row.value) === "supports")
      .flatMap((row) => stringsFrom(row.value)),
  );
  const excluded = unique(
    applicable
      .filter((row) => assertionFrom(row.value) === "excludes")
      .flatMap((row) => stringsFrom(row.value)),
  );
  const supportedKeys = new Set(supported.map(identity));
  const overlap = excluded.some((value) => supportedKeys.has(identity(value)));
  const incompatibleScalarClaims = !ARRAY_FIELDS.has(input.field) && supported.length > 1;
  const state: GrantFacetState =
    overlap || incompatibleScalarClaims
      ? "conflicting"
      : applicable.length === 0 || supported.length === 0
        ? "unknown"
        : "known";
  const confidenceValues = applicable
    .map((row) => Number(row.confidence))
    .filter((value) => Number.isFinite(value));

  return {
    field: input.field,
    state,
    values: supported.length ? supported : unique(stringsFrom(input.canonicalValue)),
    excludedValues: excluded,
    confidence: confidenceValues.length ? Math.min(...confidenceValues) : null,
    evidence: applicable,
  };
}

export function resolveGrantFacets(input: {
  grant: Partial<Record<GrantFacetField, string | string[] | null>>;
  evidence: GrantFacetEvidence[];
}): Record<GrantFacetField, ResolvedGrantFacet> {
  return Object.fromEntries(
    GRANT_FACET_FIELDS.map((field) => [
      field,
      resolveGrantFacet({
        field,
        canonicalValue: input.grant[field],
        evidence: input.evidence,
      }),
    ]),
  ) as Record<GrantFacetField, ResolvedGrantFacet>;
}

export function grantFacetEvidenceState(
  facets: Record<GrantFacetField, ResolvedGrantFacet>,
): GrantFacetState {
  const states = Object.values(facets).map((facet) => facet.state);
  if (states.includes("conflicting")) return "conflicting";
  return states.every((state) => state === "known") ? "known" : "unknown";
}
