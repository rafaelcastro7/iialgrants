import { describe, expect, it } from "vitest";
import cases from "./golden/evaluator.cases.json";
import { EvaluatorOutput } from "@/agents/schemas";

// LLM-judge harness (offline mode). When LOVABLE_API_KEY + RUN_LLM_EVALS=1
// are set, runs the real evaluator and checks the score bands. Otherwise
// validates that every golden case is well-formed (structure + expectations).
const runLlm = process.env.RUN_LLM_EVALS === "1" && !!process.env.LOVABLE_API_KEY;

describe("evals/evaluator golden set", () => {
  it("loaded 5 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  for (const c of cases as Array<{
    id: string;
    agent: string;
    input: { grant: Record<string, unknown>; organization: Record<string, unknown> };
    expected: {
      fit_score_min?: number;
      fit_score_max?: number;
      eligibility_pass?: boolean;
      must_not_contain?: string[];
    };
  }>) {
    it(`case shape: ${c.id}`, () => {
      expect(c.agent).toBe("evaluator");
      expect(c.input.grant).toBeTruthy();
      expect(c.input.organization).toBeTruthy();
      const { fit_score_min, fit_score_max } = c.expected;
      if (fit_score_min != null) expect(fit_score_min).toBeGreaterThanOrEqual(0);
      if (fit_score_max != null) expect(fit_score_max).toBeLessThanOrEqual(1);
    });
  }

  it.skipIf(!runLlm)(
    "LLM evaluator passes all golden bands",
    async () => {
      const { callLlm } = await import("@/agents/llm.server");
      const { PROMPTS } = await import("@/agents/schemas");
      for (const c of cases as Array<{
        id: string;
        input: unknown;
        expected: { fit_score_min?: number; fit_score_max?: number; eligibility_pass?: boolean };
      }>) {
        const r = await callLlm({
          model: "google/gemini-2.5-flash",
          agent: "evaluator",
          temperature: 0,
          responseFormat: "json",
          messages: [
            {
              role: "system",
              content: `${PROMPTS.evaluator.system}\nPrompt version: ${PROMPTS.evaluator.version}`,
            },
            { role: "user", content: JSON.stringify(c.input) },
          ],
        });
        const parsed = EvaluatorOutput.parse(JSON.parse(r.text));
        if (c.expected.fit_score_min != null)
          expect(parsed.fit_score, c.id).toBeGreaterThanOrEqual(c.expected.fit_score_min);
        if (c.expected.fit_score_max != null)
          expect(parsed.fit_score, c.id).toBeLessThanOrEqual(c.expected.fit_score_max);
        if (c.expected.eligibility_pass != null)
          expect(parsed.eligibility_pass, c.id).toBe(c.expected.eligibility_pass);
      }
    },
    60_000,
  );
});
