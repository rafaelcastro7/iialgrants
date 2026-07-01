import { describe, it, expect } from "vitest";
import { extractAmounts } from "./amounts.server";

describe("extractAmounts", () => {
  const cases: Array<[string, { min: number | null; max: number | null }]> = [
    ["Eligible projects are funded up to $250,000.", { min: null, max: 250_000 }],
    ["Maximum de 1 M$ pour les PME québécoises.", { min: null, max: 1_000_000 }],
    ["Funding between $50,000 and $250,000.", { min: 50_000, max: 250_000 }],
    ["Le montant varie de 50 000 $ à 500 000 $.", { min: 50_000, max: 500_000 }],
    ["Jusqu'à 2,5 M$ par projet.", { min: null, max: 2_500_000 }],
    ["This project offers $50K–$250K in funding.", { min: 50_000, max: 250_000 }],
    ["Subvention de 100 000 $ - 1 M$.", { min: 100_000, max: 1_000_000 }],
    ["Not to exceed $75,000.", { min: null, max: 75_000 }],
    ["No funding mentioned here at all.", { min: null, max: null }],
  ];
  for (const [text, expected] of cases) {
    it(text, () => {
      const r = extractAmounts(text);
      if (expected.max == null) expect(r).toBeNull();
      else {
        expect(r).not.toBeNull();
        expect(r!.max).toBe(expected.max);
        expect(r!.min).toBe(expected.min);
      }
    });
  }
});
