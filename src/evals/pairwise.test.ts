// Gate 4 (pairwise) + Gate 5 (adversarial) — unit-level eval harness.
// These gates run in CI without calling any LLM: they test invariants of
// the input schema and our prompt-injection defense surface. End-to-end
// LLM-judge cases run in nightly evals (see RUNBOOK).
import { describe, it, expect } from "vitest";
import cases from "./golden/evaluator.cases.json";

type Case = {
  id: string;
  agent: string;
  input: {
    grant: { title: string; summary?: string; funder?: { jurisdiction?: string } };
    organization: { jurisdictions?: string[]; sectors?: string[]; stage?: string };
  };
  expected: {
    fit_score_min?: number;
    fit_score_max?: number;
    eligibility_pass?: boolean;
    must_not_contain?: string[];
  };
};

const ALL = cases as Case[];

describe("evals/evaluator pairwise + adversarial", () => {
  it("every case is well-typed and uniquely identified", () => {
    const ids = new Set<string>();
    for (const c of ALL) {
      expect(c.id).toMatch(/^evaluator-/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.input.grant.title.length).toBeGreaterThan(2);
    }
  });

  it("(Gate 4) pairwise — adversarial < positive on fit_score upper bound", () => {
    const positive = ALL.find((c) => c.id === "evaluator-fit-perfect");
    const adversarial = ALL.find((c) => c.id === "evaluator-adversarial-prompt-injection");
    expect(positive?.expected.fit_score_min).toBeGreaterThanOrEqual(0.7);
    expect(adversarial?.expected.fit_score_max ?? 1).toBeLessThanOrEqual(0.5);
  });

  it("(Gate 5) adversarial — prompt-injection cases must declare must_not_contain", () => {
    const adv = ALL.filter((c) => /adversarial|injection/i.test(c.id));
    expect(adv.length).toBeGreaterThan(0);
    for (const c of adv) {
      expect(c.expected.must_not_contain?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("(Gate 5) jurisdiction-mismatch cases must fail eligibility", () => {
    const jc = ALL.find((c) => c.id === "evaluator-fit-jurisdiction-mismatch");
    expect(jc?.expected.eligibility_pass).toBe(false);
  });

  it("coverage — at least one case per failure mode (jurisdiction, sector, stage, injection)", () => {
    const required = ["jurisdiction", "sector", "stage", "injection"];
    for (const tag of required) {
      expect(ALL.some((c) => c.id.includes(tag))).toBe(true);
    }
  });
});
