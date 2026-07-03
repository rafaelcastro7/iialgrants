/**
 * Multi-axis grant scoring with explainability.
 * Replaces opaque single-number score with 5 transparent dimensions + reasoning.
 *
 * Uses qwen3:14b for analysis + deepseek-r1 for reasoning/explanation.
 */

import { z } from "zod";
import { callFreeLlm } from "@/agents/llm-free.server";

const AxisScoreSchema = z.object({
  axis: z.string().describe("Axis name (relevance, budget_fit, timeline, capability, winning_probability)"),
  score: z.number().min(0).max(10).describe("Score 0-10"),
  reasoning: z.string().describe("Why this score (1-2 sentences)"),
  evidence: z.string().optional().describe("Quote or data point supporting this score"),
});

const MultiAxisScoreSchema = z.object({
  scores: z.array(AxisScoreSchema),
  overall: z.number().min(0).max(100).describe("Weighted average of axis scores"),
  summary: z.string().describe("3-sentence summary of fit"),
  confidence: z.number().min(0).max(1).describe("0-1 confidence in this assessment"),
});

export type MultiAxisScore = z.infer<typeof MultiAxisScoreSchema>;

/**
 * Score a grant across 5 dimensions.
 *
 * Dimensions:
 * 1. Relevance (0-10): keyword match, topic alignment
 * 2. Budget Fit (0-10): amount within org range
 * 3. Timeline (0-10): prep time available before deadline
 * 4. Capability (0-10): org skills match grant requirements
 * 5. Probability of Winning (0-10): based on funder, competitiveness, etc.
 */
export async function scoreGrantMultiAxis(opts: {
  grantTitle: string;
  grantSummary: string;
  amountMin?: number;
  amountMax?: number;
  deadline?: string;
  eligibility?: Record<string, unknown>;
  sectors?: string[];
  funderName?: string;
  //
  orgName: string;
  orgCapabilities: string[];
  orgBudgetMin: number;
  orgBudgetMax: number;
}): Promise<MultiAxisScore> {
  const prompt = `
Analyze this grant opportunity against the applying organization's profile.
Score across 5 axes (0-10 each), then provide overall assessment.

GRANT:
- Title: ${opts.grantTitle}
- Summary: ${opts.grantSummary}
- Amount: ${opts.amountMin ? "$" + opts.amountMin : "?"}-${opts.amountMax ? "$" + opts.amountMax : "?"} CAD
- Deadline: ${opts.deadline ?? "unknown"}
- Funder: ${opts.funderName ?? "unknown"}
- Sectors: ${opts.sectors?.join(", ") ?? "not specified"}

ORGANIZATION:
- Name: ${opts.orgName}
- Budget capacity: $${opts.orgBudgetMin}-$${opts.orgBudgetMax} CAD
- Key capabilities: ${opts.orgCapabilities.join(", ")}

SCORE AXES (0-10 each, with reasoning and evidence):
1. RELEVANCE: Does the grant topic match the org's mission/sectors?
2. BUDGET_FIT: Is the funding amount appropriate for the org's scale?
3. TIMELINE: Is there enough time to prepare a competitive proposal (assume 3-4 weeks needed)?
4. CAPABILITY: Does the org have (or can hire) the required skills/expertise?
5. WINNING_PROBABILITY: Based on the funder, how likely is success (competitiveness, funder's track record)?

Return JSON:
{
  "scores": [
    {"axis": "relevance", "score": <0-10>, "reasoning": "...", "evidence": "..."},
    {"axis": "budget_fit", "score": <0-10>, "reasoning": "...", "evidence": "..."},
    {"axis": "timeline", "score": <0-10>, "reasoning": "...", "evidence": "..."},
    {"axis": "capability", "score": <0-10>, "reasoning": "...", "evidence": "..."},
    {"axis": "winning_probability", "score": <0-10>, "reasoning": "...", "evidence": "..."}
  ],
  "overall": <weighted 0-100, typically 20% each>,
  "summary": "<3-sentence summary of fit>",
  "confidence": <0-1>
}

Be specific. Cite grant details and org facts. Be honest about weaknesses.
  `;

  try {
    const result = await callFreeLlm({
      agent: "enricher", // Reuse enricher agent category
      messages: [
        {
          role: "system",
          content: `You are a grant analyst. Evaluate opportunities objectively.
          Return ONLY valid JSON matching the schema. Do not add markdown formatting.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      responseFormat: "json",
      temperature: 0.3, // Deterministic scoring
      allowLovableFallback: false,
    });

    const json = JSON.parse(result.text);
    const validated = MultiAxisScoreSchema.parse(json);

    return validated;
  } catch (e) {
    // Fallback: neutral scoring if LLM fails
    const fallback: MultiAxisScore = {
      scores: [
        {
          axis: "relevance",
          score: 5,
          reasoning: "Unable to assess (data incomplete)",
        },
        {
          axis: "budget_fit",
          score: 5,
          reasoning: "Unable to assess (data incomplete)",
        },
        {
          axis: "timeline",
          score: 5,
          reasoning: "Unable to assess (data incomplete)",
        },
        {
          axis: "capability",
          score: 5,
          reasoning: "Unable to assess (data incomplete)",
        },
        {
          axis: "winning_probability",
          score: 5,
          reasoning: "Unable to assess (data incomplete)",
        },
      ],
      overall: 50,
      summary: "Assessment unavailable. Please review manually.",
      confidence: 0,
    };

    return fallback;
  }
}

/**
 * Format multi-axis score for display (human-friendly).
 */
export function formatMultiAxisScore(score: MultiAxisScore): string {
  const lines: string[] = [];

  lines.push(`📊 Grant Fit Analysis`);
  lines.push(`Overall: ${score.overall}/100 (Confidence: ${(score.confidence * 100).toFixed(0)}%)`);
  lines.push("");

  for (const axis of score.scores) {
    const bar = "█".repeat(Math.floor(axis.score)) + "░".repeat(10 - Math.floor(axis.score));
    lines.push(`${axis.axis.toUpperCase()}: ${axis.score}/10 [${bar}]`);
    lines.push(`  → ${axis.reasoning}`);
    if (axis.evidence) {
      lines.push(`  📌 ${axis.evidence}`);
    }
  }

  lines.push("");
  lines.push(`Summary: ${score.summary}`);

  return lines.join("\n");
}
