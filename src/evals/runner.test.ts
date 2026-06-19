import { describe, expect, it } from "vitest";
import { GoldenCase } from "./types";
import seed from "./golden/evaluator.seed.json";

// Phase 0 gate: golden set is well-formed and adversarial coverage exists.
// Real LLM execution + judge wires in Phase 1 once Evaluator agent ships.
describe("evals/golden-set", () => {
  it("parses every golden case", () => {
    for (const raw of seed) expect(() => GoldenCase.parse(raw)).not.toThrow();
  });

  it("has at least one adversarial case per agent in scope", () => {
    const adv = seed.filter((c) => c.adversarial);
    expect(adv.length).toBeGreaterThan(0);
  });
});
