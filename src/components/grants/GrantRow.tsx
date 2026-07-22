// Shared grant shape used across the grants board and detail views.
//
// The former dense "row" UI (GrantRow component), its inline FitChip, and the
// sortByFit comparator were removed as dead code — the board renders the
// Kanban card (GrantKanban.tsx) and sorting now lives in GrantFilters
// (sortGrants). Only the data shape is still shared, kept here so existing
// `import type { GrantRowData } from "./GrantRow"` paths keep working.

export type GrantRowData = {
  id: string;
  title: string;
  title_fr: string | null;
  summary: string | null;
  summary_fr: string | null;
  amount_cad_min: number | null;
  amount_cad_max: number | null;
  deadline: string | null;
  status: string;
  url: string;
  discovered_at: string | null;
  enriched_at: string | null;
  scored_at: string | null;
  fit_score: number | null;
  funder:
    | { name: string; name_fr: string | null; jurisdiction: string | null }
    | { name: string; name_fr: string | null; jurisdiction: string | null }[]
    | null;
  evaluation: {
    fit_score: number;
    eligibility_pass: boolean;
    rationale_en: string;
    rationale_fr: string;
    created_at: string;
  } | null;
  /** Present only for server-ranked text searches; score is ranking evidence, not confidence. */
  searchMatch?: { relevance: number; matched_on: string } | null;
  profileMatch?: {
    score: number;
    hardBlocked: boolean;
    matched: string[];
    missing: string[];
  } | null;
  feedbackAction?: "saved" | "hidden" | "rejected" | "restored" | "pursued" | null;
  combinedRelevance?: number;
  // >1 means other active grants share this funder + a near-identical title —
  // a real, recurring data-quality issue (contaminated test-seed rows, or
  // genuine re-discovery not yet deduped). UI-only signal, never merges data.
  duplicateGroupSize?: number;
};
