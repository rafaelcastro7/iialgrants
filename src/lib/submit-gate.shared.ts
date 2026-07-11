// S3a reviewer-simulation submit gate — pure, isomorphic (no createServerFn
// import), so both the server (submissions.functions.ts's submitProposal)
// and the client (proposal detail route's primary-CTA logic) evaluate the
// exact same rule. Split out of submissions.functions.ts, which bundles
// createServerFn — importing from it directly in client code risks the same
// import-protection build issue MAX_ENRICH_ATTEMPTS was moved out of
// enricher.functions.ts for (see pipeline-stages.shared.ts).

// Minimum critic score (0-1 scale, see CriticOutput in schemas.ts) below which
// a proposal is considered not ready to submit unless the user forces it.
export const MIN_CRITIC_SCORE_TO_SUBMIT = 0.6;

// Below this, computeProposalReadiness (proposal-readiness.ts) itself already
// calls a section "blocked" rather than "partial" — reuse that same cutoff so
// a proposal whose sections are mostly blocked can't pass the gate purely
// because it has one thin drafted section and a critic score from before the
// others were even started.
export const MIN_READINESS_SCORE_TO_SUBMIT = 45;

export type SubmitGateInput = {
  criticScore: number | null; // 0-1
  readinessScore: number; // 0-100
  openCriticalRequirements: number;
  draftedSections: number;
};

// Pure, unit-testable reviewer-simulation gate (S3a). Returns machine-readable
// reasons so the UI can explain exactly why a submit is blocked. Never a hard
// wall — submitProposal accepts `force: true` to override.
export function canSubmit(g: SubmitGateInput): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (g.draftedSections === 0) reasons.push("no_sections_drafted");
  if (g.criticScore == null) reasons.push("not_reviewed");
  else if (g.criticScore < MIN_CRITIC_SCORE_TO_SUBMIT) reasons.push("low_critic_score");
  if (g.openCriticalRequirements > 0) reasons.push("open_critical_requirements");
  if (g.readinessScore < MIN_READINESS_SCORE_TO_SUBMIT) reasons.push("low_readiness");
  return { ok: reasons.length === 0, reasons };
}
