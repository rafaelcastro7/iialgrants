// Regression tests for the AI-accountability authorship math: the
// human_edited_pct snapshot captured at submit time, and the win-rate
// correlation buckets that answer "does AI-verbatim content perform worse
// than human-edited content." Neither had any coverage before this — the
// human-review gate they support is the centerpiece safety feature of the
// AI-accountability redesign and was shipping with zero tests.
import { describe, expect, it } from "vitest";
import {
  AUTHORSHIP_BUCKETS,
  computeAuthorshipBuckets,
  computeHumanEditedPct,
  MIN_SAMPLE_FOR_RATE,
} from "@/lib/authorship-correlation.shared";

describe("computeHumanEditedPct", () => {
  it("returns null when there are no sections at all", () => {
    expect(computeHumanEditedPct([])).toBeNull();
  });

  it("returns null when no section has drafted content (honest empty state, not 0)", () => {
    expect(
      computeHumanEditedPct([
        { content_en: "", human_edited: false },
        { content_en: null, human_edited: true },
      ]),
    ).toBeNull();
  });

  it("ignores sections with no drafted content when computing the percentage", () => {
    const pct = computeHumanEditedPct([
      { content_en: "drafted", human_edited: true },
      { content_en: "", human_edited: false }, // not drafted — excluded from denominator
    ]);
    expect(pct).toBe(100);
  });

  it("computes 0% when nothing has been human-edited", () => {
    expect(
      computeHumanEditedPct([
        { content_en: "a", human_edited: false },
        { content_en: "b", human_edited: false },
      ]),
    ).toBe(0);
  });

  it("computes 100% when every drafted section has been human-edited", () => {
    expect(
      computeHumanEditedPct([
        { content_en: "a", human_edited: true },
        { content_en: "b", human_edited: true },
      ]),
    ).toBe(100);
  });

  it("rounds a partial percentage", () => {
    // 1 of 3 edited = 33.33...% -> rounds to 33
    expect(
      computeHumanEditedPct([
        { content_en: "a", human_edited: true },
        { content_en: "b", human_edited: false },
        { content_en: "c", human_edited: false },
      ]),
    ).toBe(33);
  });

  it("treats missing human_edited as not edited", () => {
    expect(computeHumanEditedPct([{ content_en: "a" }])).toBe(0);
  });
});

describe("computeAuthorshipBuckets", () => {
  const bucketOf = (results: ReturnType<typeof computeAuthorshipBuckets>, key: string) =>
    results.find((b) => b.key === key)!;

  it("returns every defined bucket with zero counts and a null win rate when there are no outcomes", () => {
    const result = computeAuthorshipBuckets([], new Map());
    expect(result).toHaveLength(AUTHORSHIP_BUCKETS.length);
    for (const b of result) {
      expect(b.won).toBe(0);
      expect(b.decided).toBe(0);
      expect(b.winRatePct).toBeNull();
    }
  });

  it("excludes outcomes whose submission has no recorded human_edited_pct", () => {
    const pctById = new Map<string, number | null>([["s1", null]]);
    const result = computeAuthorshipBuckets(
      [{ submission_id: "s1", result: "won" }],
      pctById,
    );
    expect(result.every((b) => b.decided === 0)).toBe(true);
  });

  it("assigns pct=0 to the '0' bucket, not '1-49'", () => {
    const pctById = new Map([["s1", 0]]);
    const result = computeAuthorshipBuckets([{ submission_id: "s1", result: "won" }], pctById);
    expect(bucketOf(result, "0").decided).toBe(1);
    expect(bucketOf(result, "1-49").decided).toBe(0);
  });

  it("assigns pct=100 to the '100' bucket, not '50-99'", () => {
    const pctById = new Map([["s1", 100]]);
    const result = computeAuthorshipBuckets([{ submission_id: "s1", result: "lost" }], pctById);
    expect(bucketOf(result, "100").decided).toBe(1);
    expect(bucketOf(result, "50-99").decided).toBe(0);
  });

  it("assigns boundary values 49 and 50 to distinct buckets", () => {
    const pctById = new Map([
      ["a", 49],
      ["b", 50],
    ]);
    const result = computeAuthorshipBuckets(
      [
        { submission_id: "a", result: "won" },
        { submission_id: "b", result: "won" },
      ],
      pctById,
    );
    expect(bucketOf(result, "1-49").decided).toBe(1);
    expect(bucketOf(result, "50-99").decided).toBe(1);
  });

  it("withholds winRatePct below MIN_SAMPLE_FOR_RATE even at a 100% win rate", () => {
    const pctById = new Map(
      Array.from({ length: MIN_SAMPLE_FOR_RATE - 1 }, (_, i) => [`s${i}`, 0] as const),
    );
    const outcomes = Array.from({ length: MIN_SAMPLE_FOR_RATE - 1 }, (_, i) => ({
      submission_id: `s${i}`,
      result: "won",
    }));
    const result = computeAuthorshipBuckets(outcomes, pctById);
    expect(bucketOf(result, "0").decided).toBe(MIN_SAMPLE_FOR_RATE - 1);
    expect(bucketOf(result, "0").winRatePct).toBeNull();
  });

  it("reports winRatePct once a bucket reaches MIN_SAMPLE_FOR_RATE", () => {
    const pctById = new Map(
      Array.from({ length: MIN_SAMPLE_FOR_RATE }, (_, i) => [`s${i}`, 0] as const),
    );
    const outcomes = Array.from({ length: MIN_SAMPLE_FOR_RATE }, (_, i) => ({
      submission_id: `s${i}`,
      result: i === 0 ? "lost" : "won",
    }));
    const result = computeAuthorshipBuckets(outcomes, pctById);
    const zeroBucket = bucketOf(result, "0");
    expect(zeroBucket.decided).toBe(MIN_SAMPLE_FOR_RATE);
    expect(zeroBucket.won).toBe(MIN_SAMPLE_FOR_RATE - 1);
    expect(zeroBucket.winRatePct).toBe(
      Math.round(((MIN_SAMPLE_FOR_RATE - 1) / MIN_SAMPLE_FOR_RATE) * 100),
    );
  });
});
