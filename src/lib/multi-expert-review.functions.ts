"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Multi-Expert Review System
 *
 * Independent panel of reviewers that critique proposals from different angles.
 * Inspired by Granted AI's 6-expert review pattern.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

const ExpertPanelOutput = z.object({
  reviews: z
    .array(
      z.object({
        reviewer: z.string().optional(),
        score: z.number().min(0).max(10),
        strengths: z.array(z.string()).default([]),
        weaknesses: z.array(z.string()).default([]),
        findings: z
          .array(
            z.object({
              section: z.string().default("General"),
              severity: z.enum(["critical", "major", "minor", "suggestion"]).default("minor"),
              issue: z.string(),
              suggestion: z.string().default(""),
            }),
          )
          .default([]),
      }),
    )
    .min(1)
    .max(6),
});

export const scoreProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
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
  )
  .handler(async ({ data, context }) => {
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("critic");
    const { callLlm } = await import("@/agents/llm.server");
    const { newRunId } = await import("@/lib/otel");
    const supabase = await createSupabaseAdmin();
    const runId = newRunId();
    const t0 = Date.now();

    const lensList = REVIEWER_ARCHETYPES.map((a, i) => `${i + 1}. ${a.name} — ${a.lens}`).join(
      "\n",
    );

    // This used to always return score=5 with empty strengths/weaknesses/
    // findings for every reviewer regardless of input — a fabricated "6
    // independent reviewers" analysis. One real LLM call (reusing the
    // "critic" agent slot rather than inventing a new one) evaluates the
    // actual section text from all 6 lenses in a single pass.
    let llm: Awaited<ReturnType<typeof callLlm>>;
    try {
      llm = await callLlm({
        agent: "critic",
        runId,
        temperature: 0.2,
        responseFormat: "json",
        messages: [
          {
            role: "system",
            content: `You are an independent 6-reviewer expert panel assessing a real grant proposal, one lens per reviewer, IN THIS EXACT ORDER:\n${lensList}\n\nBase every strength, weakness, and finding ONLY on the actual proposal section content and grant requirements given below — never invent detail that isn't present. If a section is missing, empty, or too thin to assess from a given lens, say so plainly as a weakness rather than fabricating content.\n\nRespond as JSON only: {"reviews":[{"reviewer":"<name>","score":<0-10>,"strengths":["..."],"weaknesses":["..."],"findings":[{"section":"<section title, or \\"General\\">","severity":"critical|major|minor|suggestion","issue":"...","suggestion":"..."}]}]} — exactly one entry per reviewer above, in the same order.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              sections: data.sections,
              grantRequirements: data.grantRequirements ?? null,
              orgProfile: data.orgProfile ?? null,
            }),
          },
        ],
      });
    } catch (llmErr) {
      await supabase.from("agent_runs").insert({
        run_id: runId,
        agent: "critic",
        status: "failed",
        model: "dolphin3:latest",
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        error: `llm_error: ${llmErr instanceof Error ? llmErr.message : "unknown"}`,
        metadata: { proposal_id: data.proposalId, kind: "expert_panel" },
      });
      throw new Error(
        `expert_panel_llm_failed: ${llmErr instanceof Error ? llmErr.message : "unknown"}`,
      );
    }

    let parsed: z.infer<typeof ExpertPanelOutput>;
    try {
      parsed = ExpertPanelOutput.parse(JSON.parse(llm.text));
    } catch (parseErr) {
      await supabase.from("agent_runs").insert({
        run_id: runId,
        agent: "critic",
        status: "failed",
        model: "dolphin3:latest",
        input_tokens: llm.inputTokens ?? 0,
        output_tokens: llm.outputTokens ?? 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        error: `parse_error: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
        metadata: {
          proposal_id: data.proposalId,
          kind: "expert_panel",
          llm_output: llm.text?.slice(0, 200),
        },
      });
      throw new Error(
        `expert_panel_parse_failed: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
      );
    }

    // Zip by position against the fixed archetype order. If the model
    // returned fewer than 6 (a real possibility from a small local model),
    // the missing ones are honestly marked unreviewed rather than defaulted
    // to a score.
    const scores = REVIEWER_ARCHETYPES.map((archetype, i) => {
      const r = parsed.reviews[i];
      if (!r) {
        return {
          reviewer: archetype.name,
          score: null as number | null,
          reviewed: false,
          strengths: [] as string[],
          weaknesses: [] as string[],
          findings: [] as Array<{
            reviewer: string;
            severity: string;
            section: string;
            issue: string;
            suggestion: string;
          }>,
        };
      }
      return {
        reviewer: archetype.name,
        score: r.score,
        reviewed: true,
        strengths: r.strengths,
        weaknesses: r.weaknesses,
        findings: r.findings.map((f) => ({
          reviewer: archetype.name,
          severity: f.severity,
          section: f.section || "General",
          issue: f.issue,
          suggestion: f.suggestion,
        })),
      };
    });

    const reviewed = scores.filter((s) => s.reviewed && s.score != null);
    const weightById = new Map(REVIEWER_ARCHETYPES.map((a) => [a.name, a.weight]));
    const weightSum = reviewed.reduce((sum, s) => sum + (weightById.get(s.reviewer) ?? 0), 0);
    // Renormalize over whichever reviewers actually responded, so a partial
    // response doesn't just silently drag the score down by omission.
    const overallScore =
      weightSum > 0
        ? reviewed.reduce(
            (sum, s) => sum + (s.score as number) * ((weightById.get(s.reviewer) ?? 0) / weightSum),
            0,
          )
        : 0;

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

    await supabase.from("agent_runs").insert({
      run_id: runId,
      agent: "critic",
      status: "succeeded",
      model: "dolphin3:latest",
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      user_id: context.userId,
      metadata: {
        proposal_id: data.proposalId,
        kind: "expert_panel",
        reviewed: reviewed.length,
        total: REVIEWER_ARCHETYPES.length,
        score: overallScore,
      },
    });

    const allFindings = scores.flatMap((s) => s.findings);
    return {
      overallScore: Math.round(overallScore * 10) / 10,
      consensusScore: overallScore,
      scores,
      allFindings,
      topWeaknesses: scores.flatMap((s) => s.weaknesses).slice(0, 6),
      consensusStrengths: scores.flatMap((s) => s.strengths).slice(0, 6),
      recommendations: allFindings.filter((f) => f.suggestion).map((f) => f.suggestion),
      reviewedCount: reviewed.length,
      totalReviewers: REVIEWER_ARCHETYPES.length,
    };
  });

export const getReviewerArchetypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async () => {
    try {
      return REVIEWER_ARCHETYPES;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getProposalReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      proposalId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
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
