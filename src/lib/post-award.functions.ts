"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Post-Award Intelligence System
 *
 * Tracks grant outcomes, compliance, and reporting requirements.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Get submission outcomes
 */
export const getSubmissionOutcomes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      submissionId: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).default(50),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      let query = supabase
        .from("outcomes")
        .select(
          `
          *,
          submission:submissions(
            id, submitted_at, method, confirmation_number,
            grant:grants(id, title, funder_id),
            proposal:proposals(id, title)
          )
        `,
        )
        .order("decision_date", { ascending: false });

      if (data.submissionId) query = query.eq("submission_id", data.submissionId);

      const { data: outcomes, error } = await query.limit(data.limit);
      if (error) throw new Error(`Failed to fetch outcomes: ${error.message}`);
      return outcomes || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Calculate win rate and ROI
 */
export const getAwardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      period: z.enum(["month", "quarter", "year", "all"]).default("year"),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: outcomes } = await supabase
        .from("outcomes")
        .select("result, amount_awarded_cad, decision_date");

      const total = outcomes?.length || 0;
      const won = outcomes?.filter((o) => o.result === "won").length || 0;
      const lost = outcomes?.filter((o) => o.result === "lost").length || 0;
      const pending = outcomes?.filter((o) => o.result === "no_response").length || 0;
      const withdrawn = outcomes?.filter((o) => o.result === "withdrawn").length || 0;

      const totalAwarded =
        outcomes
          ?.filter((o) => o.result === "won")
          .reduce((sum, o) => sum + (o.amount_awarded_cad || 0), 0) || 0;

      return {
        total,
        won,
        lost,
        pending,
        withdrawn,
        winRate: total > 0 ? Math.round((won / total) * 100) : 0,
        totalAwarded,
        avgAward: won > 0 ? Math.round(totalAwarded / won) : 0,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Track reporting deadlines
 */
export const getReportingDeadlines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      submissionId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      let query = supabase
        .from("outcomes")
        .select(
          `
          id, result, amount_awarded_cad, decision_date,
          submission:submissions(
            id, submitted_at,
            grant:grants(id, title, funder_id),
            proposal:proposals(id, title)
          )
        `,
        )
        .eq("result", "won");

      if (data.submissionId) query = query.eq("submission_id", data.submissionId);

      const { data: outcomes, error } = await query;
      if (error) throw new Error(`Failed to fetch deadlines: ${error.message}`);

      const deadlines = (outcomes || []).map((o) => {
        const submission = Array.isArray(o.submission) ? o.submission[0] : o.submission;
        const grant = Array.isArray(submission?.grant) ? submission?.grant[0] : submission?.grant;

        return {
          outcomeId: o.id,
          grantTitle: grant?.title || "Unknown",
          amountAwarded: o.amount_awarded_cad,
          decisionDate: o.decision_date,
          reportingRequirements: [
            { type: "progress_report", frequency: "quarterly", dueDate: null },
            { type: "financial_report", frequency: "annual", dueDate: null },
            { type: "final_report", frequency: "once", dueDate: null },
          ],
        };
      });

      return deadlines;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Generate outcome report
 */
export const generateOutcomeReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async () => {
    try {
      const metrics = await getAwardMetrics({ data: { period: "all" } });
      const outcomes = await getSubmissionOutcomes({ data: { limit: 100 } });

      return {
        summary: metrics,
        recentOutcomes: outcomes.slice(0, 20),
        insights: [
          metrics.winRate >= 30
            ? "Win rate is above industry average (30%)"
            : "Win rate is below industry average — consider improving proposal quality",
          metrics.totalAwarded > 100000
            ? "Strong funding portfolio"
            : "Consider diversifying funding sources",
        ],
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
