// Pipeline analytics (Instrumentl-style win-rate + funnel), computed purely from
// grant status-transition events. No new table: everything derives from
// grant_events (from_status → to_status @ created_at) plus current grant status.
// Pure + deterministic → unit-testable and reproducible.

import type { GrantStatus } from "@/agents/pipeline-stages.shared";

export type TransitionEvent = {
  grant_id: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
};

export type PipelineAnalytics = {
  total: number;
  statusCounts: Record<string, number>;
  /** won / (won + lost); null until at least one outcome exists. */
  winRate: number | null;
  won: number;
  lost: number;
  submitted: number;
  /** Median days a grant sat in a stage before leaving it; null if never observed. */
  medianDaysInStage: Partial<Record<GrantStatus, number>>;
  /** Key funnel conversions as ratios 0–1 (null when the denominator is 0). */
  conversions: {
    scoredToShortlisted: number | null;
    shortlistedToProposal: number | null;
    proposalToSubmitted: number | null;
  };
};

const DAY_MS = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

/** How many grants ever reached a given status (via a transition into it). */
function everReached(events: TransitionEvent[], status: GrantStatus): Set<string> {
  const set = new Set<string>();
  for (const e of events) if (e.to_status === status) set.add(e.grant_id);
  return set;
}

export function computePipelineAnalytics(input: {
  grants: Array<{ id: string; status: string }>;
  events: TransitionEvent[];
}): PipelineAnalytics {
  const { grants, events } = input;

  const statusCounts: Record<string, number> = {};
  for (const g of grants) statusCounts[g.status] = (statusCounts[g.status] ?? 0) + 1;

  const won = grants.filter((g) => g.status === "won").length;
  const lost = grants.filter((g) => g.status === "lost").length;
  const submitted = grants.filter((g) => ["submitted", "won", "lost"].includes(g.status)).length;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) / 100 : null;

  // Time-in-stage: for each grant, sort its transitions and measure the gap the
  // grant spent in `from_status` (the interval between entering and leaving it).
  const byGrant = new Map<string, TransitionEvent[]>();
  for (const e of events) {
    const list = byGrant.get(e.grant_id) ?? [];
    list.push(e);
    byGrant.set(e.grant_id, list);
  }
  const stageDurations = new Map<GrantStatus, number[]>();
  for (const list of byGrant.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const stage = sorted[i].from_status as GrantStatus | null;
      if (!stage) continue;
      const days =
        (new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime()) /
        DAY_MS;
      if (days < 0) continue;
      const arr = stageDurations.get(stage) ?? [];
      arr.push(days);
      stageDurations.set(stage, arr);
    }
  }
  const medianDaysInStage: Partial<Record<GrantStatus, number>> = {};
  for (const [stage, days] of stageDurations) {
    const m = median(days);
    if (m != null) medianDaysInStage[stage] = m;
  }

  const ratio = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 100) / 100 : null;
  const scored = everReached(events, "scored");
  const shortlisted = everReached(events, "shortlisted");
  const inProposal = everReached(events, "in_proposal");
  const submittedSet = everReached(events, "submitted");

  return {
    total: grants.length,
    statusCounts,
    winRate,
    won,
    lost,
    submitted,
    medianDaysInStage,
    conversions: {
      scoredToShortlisted: ratio(
        [...shortlisted].filter((id) => scored.has(id)).length,
        scored.size,
      ),
      shortlistedToProposal: ratio(
        [...inProposal].filter((id) => shortlisted.has(id)).length,
        shortlisted.size,
      ),
      proposalToSubmitted: ratio(
        [...submittedSet].filter((id) => inProposal.has(id)).length,
        inProposal.size,
      ),
    },
  };
}
