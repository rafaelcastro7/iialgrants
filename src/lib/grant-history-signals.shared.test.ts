import { describe, expect, it } from "vitest";
import { computeHistoryBoost, predictNextDeadline } from "./grant-history-signals.shared";

describe("predictNextDeadline", () => {
  it("requires two observations when cadence is not explicit", () => {
    expect(predictNextDeadline({ observedDeadlines: ["2025-03-31"], asOf: "2025-04-01" })).toBeNull();
  });

  it("predicts a stable observed cycle without calling it confirmed", () => {
    expect(
      predictNextDeadline({
        observedDeadlines: ["2023-03-31", "2024-03-31", "2025-03-31"],
        asOf: "2025-04-01",
      }),
    ).toMatchObject({
      date: "2026-03-31",
      basis: "observed_cycles",
      observations: 3,
    });
  });

  it("accepts a grounded explicit cadence", () => {
    expect(
      predictNextDeadline({
        observedDeadlines: ["2025-01-15"],
        explicitCadenceDays: 365,
        asOf: "2025-02-01",
      }),
    ).toMatchObject({ date: "2026-01-15", confidence: 0.8, basis: "explicit_cadence" });
  });
});

describe("computeHistoryBoost", () => {
  it("caps all historical signals at eight points", () => {
    expect(
      computeHistoryBoost({
        hardBlocked: false,
        peerAwardCount: 100,
        repeatRecipientRate: 1,
        yearsSinceLatestAward: 0,
      }).boost,
    ).toBe(0.08);
  });

  it("cannot override a deterministic hard fail", () => {
    expect(
      computeHistoryBoost({
        hardBlocked: true,
        peerAwardCount: 100,
        repeatRecipientRate: 1,
        yearsSinceLatestAward: 0,
      }),
    ).toEqual({ boost: 0, factors: ["Eligibility hard fail; history ignored"] });
  });
});

