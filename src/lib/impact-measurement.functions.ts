"use server";

/**
 * Impact Measurement — Post-Award Outcome Tracking
 *
 * Measures community impact, beneficiary reach, and grant effectiveness.
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

export const getImpactMetrics = createServerFn({ method: "GET" })
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
              .select("result, amount_awarded_cad, decision_date, impact_description")
              .in("submission_id", allowedIds);

      const won = outcomes?.filter((o) => o.result === "won") || [];
      const totalAwarded = won.reduce((s, o) => s + (o.amount_awarded_cad || 0), 0);
      const withImpact = won.filter((o) => o.impact_description);

      return {
        totalWon: won.length,
        totalAwarded,
        withImpactDescription: withImpact.length,
        impactCoveragePct: won.length > 0 ? Math.round((withImpact.length / won.length) * 100) : 0,
        avgTimeToFunding:
          won.length > 0
            ? Math.round(
                won.reduce((s, o) => {
                  if (!o.decision_date) return s;
                  const days = Math.abs(
                    (new Date(o.decision_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                  );
                  return s + days;
                }, 0) / won.length,
              )
            : 0,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getOutcomeDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ limit: z.number().min(1).max(100).default(20) }))
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);
      const allowedIds = await allowedSubmissionIds(supabase, principal);
      if (allowedIds.length === 0) return [];

      const { data: rows, error } = await supabase
        .from("outcomes")
        .select(
          `
          id, result, amount_awarded_cad, decision_date, impact_description,
          submission:submissions(
            id,
            grant:grants(id, title, funder_id),
            proposal:proposals(id, title)
          )
        `,
        )
        .in("submission_id", allowedIds)
        .order("decision_date", { ascending: false })
        .limit(data.limit);

      if (error) throw new Error(`Failed to fetch outcomes: ${error.message}`);

      return (rows || []).map((o) => {
        const s = Array.isArray(o.submission) ? o.submission[0] : o.submission;
        const g = Array.isArray(s?.grant) ? s?.grant[0] : s?.grant;
        const p = Array.isArray(s?.proposal) ? s?.proposal[0] : s?.proposal;

        return {
          outcomeId: o.id,
          result: o.result,
          amount: o.amount_awarded_cad,
          grantTitle: g?.title || "Unknown",
          proposalTitle: p?.title || "Unknown",
          decisionDate: o.decision_date,
          impactDescription: o.impact_description,
        };
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
