import { describe, expect, it } from "vitest";
import { CEREBRAS_MODEL_MAP, GROQ_MODEL_MAP, GEMINI_MODEL_MAP } from "./llm-cloud.server";

// Guards the routing decisions that were made from live measurement, so a
// future edit that silently reverts them fails here instead of quietly
// downgrading every judgement the product makes.
describe("cloud model maps", () => {
  const AGENTS = ["discoverer", "enricher", "evaluator", "strategist", "writer", "critic"] as const;

  it("maps every agent on every provider", () => {
    for (const map of [CEREBRAS_MODEL_MAP, GROQ_MODEL_MAP, GEMINI_MODEL_MAP]) {
      for (const agent of AGENTS) {
        expect(map[agent], `${agent} is unmapped`).toBeTruthy();
      }
    }
  });

  it("keeps Cerebras on the model that answers in both plain and JSON modes", () => {
    // gpt-oss-120b and zai-glm-4.7 are larger but returned empty content
    // intermittently depending on whether response_format was set.
    for (const agent of AGENTS) {
      expect(CEREBRAS_MODEL_MAP[agent]).toBe("gemma-4-31b");
    }
  });

  it("gives the judgement agents Groq's 70B and the volume agents the fast 8B", () => {
    expect(GROQ_MODEL_MAP.evaluator).toBe("llama-3.3-70b-versatile");
    expect(GROQ_MODEL_MAP.critic).toBe("llama-3.3-70b-versatile");
    expect(GROQ_MODEL_MAP.strategist).toBe("llama-3.3-70b-versatile");
    expect(GROQ_MODEL_MAP.writer).toBe("llama-3.3-70b-versatile");
    expect(GROQ_MODEL_MAP.discoverer).toBe("llama-3.1-8b-instant");
    expect(GROQ_MODEL_MAP.enricher).toBe("llama-3.1-8b-instant");
  });

  it("does not reference Gemini models this account cannot call", () => {
    // gemini-2.0-* were retired outright; 2.5-pro and 2.5-flash-lite answer 404
    // "no longer available" here despite being listed by GET /models.
    const retired = [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
    ];
    for (const agent of AGENTS) {
      expect(retired, `${agent} points at a retired Gemini model`).not.toContain(
        GEMINI_MODEL_MAP[agent],
      );
    }
  });
});
