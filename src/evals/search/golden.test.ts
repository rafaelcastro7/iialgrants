import { describe, expect, it } from "vitest";
import cases from "./golden.cases.json";

describe("search retrieval golden set", () => {
  it("contains enough bilingual and adversarial coverage", () => {
    expect(cases.length).toBeGreaterThanOrEqual(25);
    expect(cases.filter((item) => item.language === "fr").length).toBeGreaterThanOrEqual(3);
    expect(cases.some((item) => item.tags.includes("typo"))).toBe(true);
    expect(cases.some((item) => item.tags.includes("negative"))).toBe(true);
    expect(cases.some((item) => "hardBlocked" in item)).toBe(true);
  });

  it("uses unique ids and valid graded relevance", () => {
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    for (const item of cases) {
      expect(item.query.trim().length).toBeGreaterThanOrEqual(2);
      for (const grade of Object.values(item.relevance)) {
        expect(Number.isInteger(grade)).toBe(true);
        expect(grade).toBeGreaterThanOrEqual(0);
        expect(grade).toBeLessThanOrEqual(3);
      }
    }
  });
});
