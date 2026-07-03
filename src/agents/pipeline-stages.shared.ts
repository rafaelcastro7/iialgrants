// Single source of truth for the grant pipeline state machine.
// MUST mirror the DB trigger `validate_grant_transition()` in
// supabase/migrations/20260619231215_*.sql — the DB remains the enforcer;
// this module lets client and server code check transitions without
// scattering hardcoded status strings across files.

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
  discovered: ["enriched", "archived", "expired"],
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
