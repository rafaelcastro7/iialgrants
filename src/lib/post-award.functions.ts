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
import { getTenantPrincipal, type TenantPrincipal } from "./tenant-access.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Returns the submission IDs the caller is allowed to see: their own
 * submissions, plus org-mates' submissions if org-scoped. Used to filter
 * `outcomes` queries, since that table carries no owner column of its own.
 */
async function allowedSubmissionIds(
  supabase: SupabaseClient<Database>,
  principal: TenantPrincipal,
): Promise<string[]> {
  let query = supabase.from("submissions").select("id, user_id, org_id");
  query = principal.orgId
    ? query.or(`user_id.eq.${principal.userId},org_id.eq.${principal.orgId}`)
    : query.eq("user_id", principal.userId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to scope submissions: ${error.message}`);
  return (data || []).map((s) => s.id);
}

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
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);
      const allowedIds = await allowedSubmissionIds(supabase, principal);
      if (data.submissionId && !allowedIds.includes(data.submissionId)) {
        throw new Error("Forbidden: submission belongs to another organization");
      }
      if (allowedIds.length === 0) return [];

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

      query = data.submissionId
        ? query.eq("submission_id", data.submissionId)
        : query.in("submission_id", allowedIds);

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
  .handler(async ({ context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);
      const allowedIds = await allowedSubmissionIds(supabase, principal);

      const { data: outcomes } =
        allowedIds.length === 0
          ? { data: [] }
          : await supabase
              .from("outcomes")
              .select("result, amount_awarded_cad, decision_date")
              .in("submission_id", allowedIds);

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
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);
      const allowedIds = await allowedSubmissionIds(supabase, principal);
      if (data.submissionId && !allowedIds.includes(data.submissionId)) {
        throw new Error("Forbidden: submission belongs to another organization");
      }
      if (allowedIds.length === 0) return [];

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

      query = data.submissionId
        ? query.eq("submission_id", data.submissionId)
        : query.in("submission_id", allowedIds);

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
