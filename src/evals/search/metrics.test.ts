import { describe, expect, it } from "vitest";
import { evaluateSearchCase, summarizeSearchBenchmark } from "./metrics";

const testCase = {
  id: "research",
  query: "research internship",
  language: "en" as const,
  relevance: { best: 3, related: 1, irrelevant: 0 },
  hardBlocked: ["blocked"],
};

describe("search benchmark metrics", () => {
  it("computes perfect retrieval metrics", () => {
    const row = evaluateSearchCase(testCase, ["best", "related"], 2);
    expect(row).toMatchObject({
      precisionAtK: 1,
      recallAtK: 1,
      reciprocalRank: 1,
      ndcgAtK: 1,
      hardFailLeakage: 0,
    });
  });

  it("penalizes ordering, misses, and blocked leakage", () => {
    const row = evaluateSearchCase(testCase, ["irrelevant", "blocked", "related"], 3);
    expect(row.precisionAtK).toBeCloseTo(1 / 3);
    expect(row.recallAtK).toBe(0.5);
    expect(row.reciprocalRank).toBeCloseTo(1 / 3);
    expect(row.ndcgAtK).toBeLessThan(0.3);
    expect(row.hardFailLeakage).toBe(1);
  });

  it("produces stable macro averages", () => {
    const perfect = evaluateSearchCase(testCase, ["best", "related"], 2);
    const empty = evaluateSearchCase(testCase, [], 2);
    const summary = summarizeSearchBenchmark([perfect, empty]);
    expect(summary).toMatchObject({
      cases: 2,
      precisionAtK: 0.5,
      recallAtK: 0.5,
      mrr: 0.5,
      ndcgAtK: 0.5,
      hardFailLeakage: 0,
    });
  });

  it("rewards an empty result for a negative query and penalizes false positives", () => {
    const negative = { ...testCase, relevance: {} };
    expect(evaluateSearchCase(negative, [], 10).precisionAtK).toBe(1);
    expect(evaluateSearchCase(negative, ["irrelevant"], 10).precisionAtK).toBe(0);
  });
});
