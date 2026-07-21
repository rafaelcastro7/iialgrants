"use server";

/**
 * Financial Tracking — Post-Award Budget Monitoring
 *
 * Tracks grant expenditures, burn rates, and budget vs actuals.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
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

export const getFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
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
              .eq("result", "won")
              .in("submission_id", allowedIds);

      const totalAwarded = outcomes?.reduce((s, o) => s + (o.amount_awarded_cad || 0), 0) || 0;
      const count = outcomes?.length || 0;

      const byYear = new Map<number, number>();
      for (const o of outcomes || []) {
        const year = o.decision_date ? new Date(o.decision_date).getFullYear() : 0;
        if (year > 0) {
          byYear.set(year, (byYear.get(year) || 0) + (o.amount_awarded_cad || 0));
        }
      }

      const monthlyBurn = totalAwarded / 12;

      return {
        totalAwarded,
        grantCount: count,
        avgGrantSize: count > 0 ? Math.round(totalAwarded / count) : 0,
        monthlyBurnEstimate: Math.round(monthlyBurn),
        yearOverYear: [...byYear.entries()]
          .sort(([a], [b]) => b - a)
          .map(([year, total]) => ({ year, total })),
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getBudgetTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      outcomeId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);
      const allowedIds = await allowedSubmissionIds(supabase, principal);
      if (allowedIds.length === 0) return [];

      let query = supabase
        .from("outcomes")
        .select(
          `
          id, result, amount_awarded_cad, decision_date,
          submission:submissions(
            id, submitted_at,
            grant:grants(id, title),
            proposal:proposals(id, title, budget_total_cad)
          )
        `,
        )
        .eq("result", "won")
        .in("submission_id", allowedIds);

      if (data.outcomeId) query = query.eq("id", data.outcomeId);

      const { data: rows, error } = await query;
      if (error) throw new Error(`Failed to fetch budgets: ${error.message}`);

      return (rows || []).map((o) => {
        const s = Array.isArray(o.submission) ? o.submission[0] : o.submission;
        const g = Array.isArray(s?.grant) ? s?.grant[0] : s?.grant;
        const p = Array.isArray(s?.proposal) ? s?.proposal[0] : s?.proposal;

        const awarded = o.amount_awarded_cad || 0;
        const budgeted = p?.budget_total_cad || 0;
        const utilization =
          awarded > 0 && budgeted > 0 ? Math.round((awarded / budgeted) * 100) : 0;

        return {
          outcomeId: o.id,
          grantTitle: g?.title || "Unknown",
          proposalTitle: p?.title || "Unknown",
          amountAwarded: awarded,
          budgetTotal: budgeted,
          utilizationPct: utilization,
          decisionDate: o.decision_date,
        };
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
