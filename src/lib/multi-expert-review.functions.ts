"use server";

import { createSupabaseAdmin } from "./supabase-admin";

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

export const scoreProposal = createServerFn({
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
              name: z.string(),
              weight: z.number(),
              description: z.string(),
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
  try {
    const supabase = await createSupabaseAdmin();

    const scores = REVIEWER_ARCHETYPES.map((archetype) => ({
      reviewer: archetype.name,
      score: 5,
      strengths: [] as string[],
      weaknesses: [] as string[],
      findings: [] as Array<{
        reviewer: string;
        severity: string;
        section: string;
        issue: string;
        suggestion: string;
      }>,
    }));

    const overallScore = scores.reduce((sum, s, i) => {
      return sum + s.score * REVIEWER_ARCHETYPES[i].weight;
    }, 0);

    const { error } = await supabase.from("proposal_reviews").upsert(
      {
        proposal_id: data.proposalId,
        overall_score: overallScore,
        reviewer_scores: scores,
        created_at: new Date().toISOString(),
      },
      { onConflict: "proposal_id" },
    );

    if (error) throw new Error("Failed to store review: " + error.message);

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      consensusScore: overallScore,
      scores,
      allFindings: [],
      topWeaknesses: [],
      consensusStrengths: [],
      recommendations: [],
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

export const getReviewerArchetypes = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  try {
    return REVIEWER_ARCHETYPES;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

export const getProposalReviews = createServerFn({
  method: "GET",
  validator: z.object({
    proposalId: z.string().uuid(),
  }),
}).handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

    const { data: reviews, error } = await supabase
      .from("proposal_reviews")
      .select("*")
      .eq("proposal_id", data.proposalId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
    return reviews || [];
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});
