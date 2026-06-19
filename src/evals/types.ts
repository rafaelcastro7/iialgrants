// Evals harness types (Phase 0 scaffold). Drives the 5 CI gates from ADR-004:
// unit, golden regression, LLM-as-judge, pairwise, adversarial.
import { z } from "zod";

export const GoldenCase = z.object({
  id: z.string(),
  agent: z.enum(["discoverer", "enricher", "evaluator", "strategist", "writer", "critic"]),
  input: z.unknown(),
  expected: z.unknown(),
  rubric: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  // Adversarial flag — used by the adversarial CI gate.
  adversarial: z.boolean().default(false),
});
export type GoldenCase = z.infer<typeof GoldenCase>;

export const EvalResult = z.object({
  caseId: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()).default([]),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative().default(0),
});
export type EvalResult = z.infer<typeof EvalResult>;
