export const SEARCH_RANKING_VERSION = "hybrid_rrf_v2";
export const SEARCH_TAXONOMY_VERSION = "bounded_bilingual_v1";
export const SEARCH_INDEX_VERSION = "grant_search_documents_768_hnsw_v1";

export type SearchQualityInput = {
  evidenceState: "known" | "unknown" | "conflicting";
  sourceFreshnessAt: string | null;
  sourceConfidence: number | null;
  deadlineKind: string | null;
  deadlineConfidence: number | null;
  now?: Date;
};

export type SearchQualityBreakdown = {
  evidence: number;
  freshness: number;
  sourceConfidence: number;
  deadline: number;
  total: number;
  factors: string[];
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Small, inspectable quality adjustment. Retrieval and eligibility remain the
 * primary signals; incomplete metadata can reorder close candidates but can
 * never manufacture eligibility or dominate relevance.
 */
export function computeSearchQuality(input: SearchQualityInput): SearchQualityBreakdown {
  const factors: string[] = [];
  const evidence =
    input.evidenceState === "known" ? 0.015 : input.evidenceState === "conflicting" ? -0.03 : -0.01;
  factors.push(`evidence:${input.evidenceState}`);

  let freshness = 0;
  if (input.sourceFreshnessAt) {
    const timestamp = new Date(input.sourceFreshnessAt).getTime();
    const now = (input.now ?? new Date()).getTime();
    const ageDays = Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 86_400_000) : null;
    if (ageDays != null && ageDays <= 14) freshness = 0.015;
    else if (ageDays != null && ageDays > 90) freshness = -0.02;
    factors.push(ageDays == null ? "freshness:invalid" : `freshness:${Math.floor(ageDays)}d`);
  } else {
    freshness = -0.01;
    factors.push("freshness:unknown");
  }

  const confidence = input.sourceConfidence == null ? 0 : clamp(input.sourceConfidence, 0, 1);
  const sourceConfidence = (confidence - 0.5) * 0.02;
  factors.push(
    input.sourceConfidence == null
      ? "source-confidence:unknown"
      : `source-confidence:${confidence.toFixed(2)}`,
  );

  let deadline = 0;
  if (input.deadlineKind === "confirmed") {
    deadline = 0.01 * (input.deadlineConfidence ?? 0.5);
  } else if (input.deadlineKind === "rolling") {
    deadline = 0.005;
  } else if (input.deadlineKind === "predicted") {
    deadline = -0.01;
  } else if (!input.deadlineKind || input.deadlineKind === "unknown") {
    deadline = -0.005;
  }
  factors.push(`deadline:${input.deadlineKind ?? "unknown"}`);

  return {
    evidence,
    freshness,
    sourceConfidence,
    deadline,
    total: clamp(evidence + freshness + sourceConfidence + deadline, -0.06, 0.05),
    factors,
  };
}

