import { describe, expect, it } from "vitest";
import { computePipelineAnalytics, type TransitionEvent } from "@/lib/pipeline-analytics";

const ev = (grant_id: string, from: string | null, to: string, day: number): TransitionEvent => ({
  grant_id,
  from_status: from,
  to_status: to,
  created_at: new Date(2026, 0, day).toISOString(),
});

describe("computePipelineAnalytics", () => {
  it("counts statuses and totals", () => {
    const a = computePipelineAnalytics({
      grants: [
        { id: "a", status: "won" },
        { id: "b", status: "lost" },
        { id: "c", status: "scored" },
      ],
      events: [],
    });
    expect(a.total).toBe(3);
    expect(a.statusCounts).toEqual({ won: 1, lost: 1, scored: 1 });
  });

  it("computes win rate from won/(won+lost), null when no outcomes", () => {
    expect(
      computePipelineAnalytics({ grants: [{ id: "a", status: "scored" }], events: [] }).winRate,
    ).toBeNull();
    const a = computePipelineAnalytics({
      grants: [
        { id: "a", status: "won" },
        { id: "b", status: "won" },
        { id: "c", status: "lost" },
      ],
      events: [],
    });
    expect(a.winRate).toBe(0.67);
    expect(a.won).toBe(2);
    expect(a.lost).toBe(1);
  });

  it("measures median days spent in a stage from transition gaps", () => {
    // grant a: discovered@1 → enriched@3 (2d in discovered) → scored@6 (3d in enriched)
    // grant b: discovered@1 → enriched@5 (4d in discovered)
    const a = computePipelineAnalytics({
      grants: [
        { id: "a", status: "scored" },
        { id: "b", status: "enriched" },
      ],
      events: [
        ev("a", null, "discovered", 1),
        ev("a", "discovered", "enriched", 3),
        ev("a", "enriched", "scored", 6),
        ev("b", null, "discovered", 1),
        ev("b", "discovered", "enriched", 5),
      ],
    });
    expect(a.medianDaysInStage.discovered).toBe(3); // median of [2,4]
    expect(a.medianDaysInStage.enriched).toBe(3); // [3]
  });

  it("computes funnel conversions and returns null on zero denominator", () => {
    const a = computePipelineAnalytics({
      grants: [
        { id: "a", status: "shortlisted" },
        { id: "b", status: "scored" },
      ],
      events: [
        ev("a", "enriched", "scored", 1),
        ev("a", "scored", "shortlisted", 2),
        ev("b", "enriched", "scored", 1),
      ],
    });
    // 2 grants reached scored, 1 reached shortlisted → 0.5
    expect(a.conversions.scoredToShortlisted).toBe(0.5);
    // nobody reached in_proposal → denominator (shortlisted=1) but 0 proposal
    expect(a.conversions.shortlistedToProposal).toBe(0);
    // no one reached in_proposal → proposalToSubmitted denominator 0 → null
    expect(a.conversions.proposalToSubmitted).toBeNull();
  });

  it("ignores negative/out-of-order gaps safely", () => {
    const a = computePipelineAnalytics({
      grants: [{ id: "a", status: "enriched" }],
      events: [ev("a", "discovered", "enriched", 5), ev("a", null, "discovered", 1)],
    });
    // sorted internally: discovered@1 → enriched@5 = 4d in discovered
    expect(a.medianDaysInStage.discovered).toBe(4);
  });
});
