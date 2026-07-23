import { describe, expect, it } from "vitest";
import { detectAiCliches } from "./genericity-check.shared";

describe("detectAiCliches", () => {
  it("flags the exact homogenized phrasing observed in a live writer draft", () => {
    const text =
      "The proposed project aligns with the Industrial Research Assistance Program (IRAP) [d1] " +
      "by leveraging technology innovation to drive measurable impact. As a Canadian applied " +
      "learning and innovation organization, our organization is poised to make a significant " +
      "contribution to Canada's economic growth.";
    const hits = detectAiCliches(text);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => /poised to/i.test(h.snippet))).toBe(true);
    expect(hits.some((h) => /drive measurable impact/i.test(h.snippet))).toBe(true);
  });

  it("does not flag specific, concrete prose with no rote phrasing", () => {
    const text =
      "We served 214 SMEs in the Gaspésie region in 2025, of which 38 completed a full R&D " +
      "diagnostic. This program will fund a further 60 diagnostics at $4,200 CAD each over 18 months.";
    expect(detectAiCliches(text)).toEqual([]);
  });

  it("does not flag ordinary use of individually common business words", () => {
    // "leverage" and "innovative" alone (not in a flagged multi-word construction)
    // must not trigger — only the specific rote phrase patterns should.
    const text =
      "Our innovative pilot will leverage existing lab equipment already owned by the university.";
    expect(detectAiCliches(text)).toEqual([]);
  });
});
