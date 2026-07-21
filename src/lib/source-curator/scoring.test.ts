// Regression coverage for the funder-candidate scoring/dedup pure functions.
// This ingester pipeline (see docs/HANDOFF-CODEX.md "Source ingester audit")
// had zero test coverage before this file — these three functions are what
// decide whether a scraped org is treated as new, a duplicate, or too
// low-signal to review, so a silent regression here directly degrades grant
// search quality (missed funders, or noisy duplicate funders).
import { describe, expect, it } from "vitest";
import {
  AUTO_APPROVE_THRESHOLD,
  REVIEW_MIN_THRESHOLD,
  nameSimilarity,
  normalizeName,
  scoreCandidate,
  type RawCandidate,
} from "./scoring.server";

describe("normalizeName", () => {
  it("lowercases and strips common legal-entity suffixes", () => {
    expect(normalizeName("Mitacs Inc.")).toBe("mitacs");
  });

  it("only strips whole-word suffix matches, not plurals (documents a real limit)", () => {
    // "Foundations" (plural) does NOT match the \bfoundation\b suffix regex,
    // unlike "Foundation" (singular). This is existing behavior, not a
    // regression to fix here, but worth pinning down since it means
    // "X Foundations of Canada" and "X Foundation of Canada" normalize to
    // different strings and won't dedup as a plain equality match.
    expect(normalizeName("Community Foundations of Canada")).toBe(
      "community foundations of canada",
    );
  });

  it("strips punctuation/accents to plain ascii and collapses whitespace", () => {
    // "Fondation" (singular) is stripped; the "é" in "André" isn't in the
    // [a-z0-9] keep-set so it's dropped, splitting the word.
    expect(normalizeName("Fondation  Lucie & André Chagnon")).toBe("lucie andr chagnon");
  });
});

describe("nameSimilarity", () => {
  it("returns 1 for identical (post-normalization) names", () => {
    expect(nameSimilarity("Mitacs", "Mitacs Inc.")).toBe(1);
  });

  it("returns 0 when either name is empty after normalization", () => {
    expect(nameSimilarity("", "Mitacs")).toBe(0);
    expect(nameSimilarity("Inc.", "Mitacs")).toBe(0);
  });

  it("scores near-duplicate names above the dedup threshold (0.88)", () => {
    // Same org, one with a legal suffix + punctuation difference.
    const sim = nameSimilarity(
      "Natural Sciences and Engineering Research Council of Canada",
      "Natural Sciences & Engineering Research Council of Canada",
    );
    expect(sim).toBeGreaterThanOrEqual(0.88);
  });

  it("scores unrelated names well below the dedup threshold", () => {
    const sim = nameSimilarity("Mitacs", "Ontario Trillium Foundation");
    expect(sim).toBeLessThan(0.5);
  });
});

function candidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    name: "Example Foundation",
    source_signals: ["tri_council"],
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("scores a fully-signalled candidate at or above the auto-approve threshold", () => {
    const score = scoreCandidate(
      candidate({
        bn_number: "123456789",
        disbursed_annual: 1_000_000,
        website: "https://example.org",
        source_signals: ["tri_council", "t3010_charities"],
        province: "ON",
        funder_type: "Foundation",
      }),
    );
    expect(score).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);
  });

  it("scores a bare name-only candidate below the review-min threshold", () => {
    const score = scoreCandidate(candidate());
    expect(score).toBeLessThan(REVIEW_MIN_THRESHOLD);
  });

  it("the Math.min(100, ...) cap is defensive, not reachable: max signal weights sum to 85", () => {
    const score = scoreCandidate(
      candidate({
        bn_number: "123456789",
        disbursed_annual: 1,
        website: "https://example.org",
        source_signals: ["a", "b", "c"],
        province: "ON",
        funder_type: "Foundation",
      }),
    );
    expect(score).toBe(85);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("rejects a malformed BN (not 9 digits) for the BN-signal bonus", () => {
    const withBadBn = scoreCandidate(candidate({ bn_number: "abc" }));
    const withNoBn = scoreCandidate(candidate());
    expect(withBadBn).toBe(withNoBn);
  });
});
