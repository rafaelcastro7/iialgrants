// Pure, isomorphic authorship-tracking math (no createServerFn import — see
// submit-gate.shared.ts for why: importing a createServerFn-bundling file
// directly breaks under vitest/client bundling).
//
// Backs two pieces of the AI-accountability redesign: submitProposal's
// human_edited_pct snapshot (submissions.functions.ts) and the win-rate
// correlation report (impact-measurement.functions.ts's
// getAiAuthorshipOutcomeCorrelation) that answers "does AI-verbatim content
// perform worse than human-edited content."

export type SectionForAuthorship = { content_en?: string | null; human_edited?: boolean | null };

// Percentage of drafted (non-empty) sections a human has actually edited.
// null when there is no drafted content yet — an honest "not applicable",
// not a misleading 0.
export function computeHumanEditedPct(sections: SectionForAuthorship[]): number | null {
  const drafted = sections.filter((s) => (s.content_en ?? "").trim().length > 0);
  if (drafted.length === 0) return null;
  const edited = drafted.filter((s) => s.human_edited).length;
  return Math.round((edited / drafted.length) * 100);
}

export const AUTHORSHIP_BUCKETS = [
  { key: "0", label: "100% AI-drafted (no human edits)", min: 0, max: 0 },
  { key: "1-49", label: "Mostly AI, lightly edited", min: 1, max: 49 },
  { key: "50-99", label: "Mostly human-edited", min: 50, max: 99 },
  { key: "100", label: "Fully human-edited", min: 100, max: 100 },
] as const;

// Below this sample size per bucket, a win-rate percentage is noise, not
// signal — same "honest empty state over confident zero" principle used
// elsewhere in this codebase (fit trend, quality score).
export const MIN_SAMPLE_FOR_RATE = 5;

export type DecidedOutcome = { submission_id: string; result: string };
export type AuthorshipBucketResult = (typeof AUTHORSHIP_BUCKETS)[number] & {
  won: number;
  decided: number;
  winRatePct: number | null;
};

// Buckets decided (won/lost) outcomes by the submission's human_edited_pct
// and computes a win rate per bucket, gated by MIN_SAMPLE_FOR_RATE so a
// 1-of-1 "100% win rate" can't be reported as if it were signal.
export function computeAuthorshipBuckets(
  outcomes: DecidedOutcome[],
  pctById: Map<string, number | null>,
): AuthorshipBucketResult[] {
  return AUTHORSHIP_BUCKETS.map((b) => {
    const inBucket = outcomes.filter((o) => {
      const pct = pctById.get(o.submission_id);
      return pct != null && pct >= b.min && pct <= b.max;
    });
    const won = inBucket.filter((o) => o.result === "won").length;
    const decided = inBucket.length;
    return {
      ...b,
      won,
      decided,
      winRatePct: decided >= MIN_SAMPLE_FOR_RATE ? Math.round((won / decided) * 100) : null,
    };
  });
}
