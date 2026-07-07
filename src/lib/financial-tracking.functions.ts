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

export const getFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async () => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: outcomes } = await supabase
        .from("outcomes")
        .select("result, amount_awarded_cad, decision_date")
        .eq("result", "won");

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
            grant:grants(id, title),
            proposal:proposals(id, title, budget_total_cad)
          )
        `,
        )
        .eq("result", "won");

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
