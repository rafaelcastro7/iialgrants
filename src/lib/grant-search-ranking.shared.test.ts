import { describe, expect, it } from "vitest";
import { computeSearchQuality } from "./grant-search-ranking.shared";

describe("search ranking quality contribution", () => {
  it("gives a small bounded boost to fresh, grounded, confirmed data", () => {
    const result = computeSearchQuality({
      evidenceState: "known",
      sourceFreshnessAt: "2026-09-10T00:00:00.000Z",
      sourceConfidence: 0.9,
      deadlineKind: "confirmed",
      deadlineConfidence: 0.95,
      now: new Date("2026-09-12T00:00:00.000Z"),
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThanOrEqual(0.05);
  });

  it("penalizes conflicting, stale and predicted evidence without exceeding the bound", () => {
    const result = computeSearchQuality({
      evidenceState: "conflicting",
      sourceFreshnessAt: "2025-01-01T00:00:00.000Z",
      sourceConfidence: 0.1,
      deadlineKind: "predicted",
      deadlineConfidence: 0.4,
      now: new Date("2026-09-12T00:00:00.000Z"),
    });

    expect(result.total).toBe(-0.06);
    expect(result.factors).toContain("deadline:predicted");
  });
});
