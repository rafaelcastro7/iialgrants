// Single source of truth for the grant pipeline state machine.
// MUST mirror the DB trigger `validate_grant_transition()` — check the LIVE
// function body with `docker exec docker-db-1 psql -U postgres -d postgres -c
// "\sf validate_grant_transition"` before editing this file, since later
// migrations replace earlier ones (currently defined in
// supabase/migrations/20260620142851_*.sql, not the original 20260619231215
// migration — that one only covers the original 3-transition version). The DB
// remains the enforcer; this module lets client and server code check
// transitions without scattering hardcoded status strings across files.

export const GRANT_STATUSES = [
  "discovered",
  "enriched",
  "scored",
  "shortlisted",
  "in_proposal",
  "submitted",
  "won",
  "lost",
  "expired",
  "archived",
] as const;

export type GrantStatus = (typeof GRANT_STATUSES)[number];

/** Allowed transitions, mirroring validate_grant_transition() exactly. */
export const GRANT_TRANSITIONS: Record<GrantStatus, readonly GrantStatus[]> = {
  // "scored" is reachable directly: enrichGrantImpl can mark a grant enriched
  // AND already-complete in one step, and some callers score without a
  // separate "enriched" checkpoint.
  discovered: ["enriched", "scored", "archived", "expired"],
  enriched: ["scored", "archived", "expired"],
  scored: ["shortlisted", "archived", "expired"],
  shortlisted: ["in_proposal", "archived", "expired"],
  in_proposal: ["submitted", "archived", "expired"],
  submitted: ["won", "lost", "expired"],
  won: [],
  lost: [],
  expired: ["archived"],
  archived: [],
};

export function isGrantStatus(s: unknown): s is GrantStatus {
  return typeof s === "string" && (GRANT_STATUSES as readonly string[]).includes(s);
}

export function canTransition(from: GrantStatus, to: GrantStatus): boolean {
  if (from === to) return true; // no-op updates are allowed by the DB trigger
  return GRANT_TRANSITIONS[from].includes(to);
}

// Grants that fail enrichment this many times stop being retried automatically
// (see enrichGrantImpl in enricher.functions.ts) and stay stuck in
// "discovered" with the fetch error preserved on enrich_last_error. Lives in
// this client-safe shared module (not enricher.functions.ts, which bundles
// createServerFn) so UI components can surface "retries exhausted" to users.
export const MAX_ENRICH_ATTEMPTS = 3;

/** Statuses shown as Kanban columns, in pipeline order. */
export const PIPELINE_ORDER: readonly GrantStatus[] = [
  "discovered",
  "enriched",
  "scored",
  "shortlisted",
  "in_proposal",
  "submitted",
  "won",
];
