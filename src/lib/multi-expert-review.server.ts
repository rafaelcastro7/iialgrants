/**
 * Multi-Expert Review System
 *
 * Independent panel of reviewers that critique proposals from different angles.
 * Inspired by Granted AI's 6-expert review pattern.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const REVIEWER_ARCHETYPES = [
  {
    id: "domain_expert",
    name: "Domain Expert",
    lens: "Methodology, evidence base, field conventions, technical accuracy",
    weight: 0.2,
  },
  {
    id: "program_officer",
    name: "Program Officer",
    lens: "Funder alignment, priority fit, format compliance, eligibility",
    weight: 0.2,
  },
  {
    id: "budget_analyst",
    name: "Budget Analyst",
    lens: "Cost justification, budget realism, math correctness, benchmarks",
    weight: 0.15,
  },
  {
    id: "feasibility_reviewer",
    name: "Feasibility Reviewer",
    lens: "Timeline realism, team capacity, milestones, risk mitigation",
    weight: 0.15,
  },
  {
    id: "edi_reviewer",
    name: "EDI & Impact Reviewer",
    lens: "Equity, diversity, inclusion, community impact, accessibility",
    weight: 0.15,
  },
  {
    id: "skeptic",
    name: "Skeptic",
    lens: "Unstated assumptions, gaps, inconsistencies, missing evidence",
    weight: 0.15,
  },
] as const;

interface ReviewFinding {
  reviewer: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  section: string;
  issue: string;
  suggestion: string;
  quote?: string;
}

interface ReviewerScore {
  reviewer: string;
  score: number; // 1-10
  strengths: string[];
  weaknesses: string[];
  findings: Reviewfinding[];
}

interface ReviewPanelResult {
  overallScore: number;
  consensusScore: number;
  scores: ReviewerScore[];
  allFindings: Reviewfinding[];
  topWeaknesses: Reviewfinding[];
  consensusStrengths: string[];
  recommendations: string[];
}

/**
 * Score a proposal section against a rubric
 */
const scoreProposal = createServerFn({
  method: "POST",
  validator: z.object({
    proposalId: z.string().uuid(),
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        content: z.string(),
        wordCount: z.number(),
      }),
    ),
    grantRequirements: z
      .object({
        mandatorySections: z.array(z.string()),
        pageLimits: z.record(z.number()).optional(),
        evaluationCriteria: z
          .array(
            z.object({
              name: string,
              weight: number,
              description: string,
            }),
          )
          .optional(),
      })
      .optional(),
    orgProfile: z
      .object({
        sectors: z.array(z.string()),
        jurisdictions: z.array(z.string()),
        capabilities: z.array(z.string()),
      })
      .optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  // Combine all sections into full proposal text
  const fullProposal = data.sections
    .map((s) => `## ${s.title}\n\n${s.content}`)
    .join("\n\n---\n\n");

  // In production, this would call the LLM for each reviewer archetype
  // For now, return a structured review template
  const scores: ReviewerScore[] = REVIEWER_ARCHETYPES.map((archetype) => ({
    reviewer: archetype.name,
    score: 5, // Placeholder — would be LLM-scored
    strengths: [],
    weaknesses: [],
    findings: [],
  }));

  // Calculate weighted overall score
  const overallScore = scores.reduce((sum, s, i) => {
    return sum + s.score * REVIEWER_ARCHETYPES[i].weight;
  }, 0);

  // Store review in database
  const { error } = await supabase.from("proposal_reviews").upsert(
    {
      proposal_id: data.proposalId,
      overall_score: overallScore,
      reviewer_scores: scores,
      created_at: new Date().toISOString(),
    },
    { onConflict: "proposal_id" },
  );

  if (error) console.error("Failed to store review:", error.message);

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    consensusScore: overallScore,
    scores,
    allFindings: [],
    topWeaknesses: [],
    consensusStrengths: [],
    recommendations: [],
  };
});

/**
 * Get reviewer archetypes
 */
const getReviewerArchetypes = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(() => {
  return REVIEWER_ARCHETYPES;
});

/**
 * Get review history for a proposal
 */
const getProposalReviews = createServerFn({
  method: "GET",
  validator: z.object({
    proposalId: z.string().uuid(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: reviews, error } = await supabase
    .from("proposal_reviews")
    .select("*")
    .eq("proposal_id", data.proposalId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
  return reviews || [];
});

export { scoreProposal, getReviewerArchetypes, getProposalReviews };
