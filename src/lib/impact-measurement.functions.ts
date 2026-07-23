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

// Closes the feedback-loop gap an external audit flagged: the system had no
// way to tell whether its own AI-drafted content helps or hurts win rate.
// submissions.human_edited_pct (captured at submit time, see
// submissions.functions.ts) is now correlated against outcomes.result —
// this is the first report that can actually answer "does AI-verbatim
// content perform worse than human-edited content."
const AUTHORSHIP_BUCKETS = [
  { key: "0", label: "100% AI-drafted (no human edits)", min: 0, max: 0 },
  { key: "1-49", label: "Mostly AI, lightly edited", min: 1, max: 49 },
  { key: "50-99", label: "Mostly human-edited", min: 50, max: 99 },
  { key: "100", label: "Fully human-edited", min: 100, max: 100 },
] as const;

// Below this sample size per bucket, a win-rate percentage is noise, not
// signal — same "honest empty state over confident zero" principle used
// elsewhere in this codebase (fit trend, quality score).
const MIN_SAMPLE_FOR_RATE = 5;

export const getAiAuthorshipOutcomeCorrelation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    const supabase = await createSupabaseAdmin();
    const principal = await getTenantPrincipal(supabase, context.userId);

    let subQuery = supabase.from("submissions").select("id, human_edited_pct");
    subQuery = principal.orgId
      ? subQuery.or(`user_id.eq.${principal.userId},org_id.eq.${principal.orgId}`)
      : subQuery.eq("user_id", principal.userId);
    const { data: subs, error: subErr } = await subQuery;
    if (subErr) throw new Error(`Failed to load submissions: ${subErr.message}`);
    const pctById = new Map((subs ?? []).map((s) => [s.id, s.human_edited_pct]));
    const ids = [...pctById.keys()];
    if (ids.length === 0) {
      return {
        buckets: AUTHORSHIP_BUCKETS.map((b) => ({
          ...b,
          won: 0,
          decided: 0,
          winRatePct: null as number | null,
        })),
        totalDecided: 0,
      };
    }

    const { data: outcomes, error: outErr } = await supabase
      .from("outcomes")
      .select("submission_id, result")
      .in("submission_id", ids)
      .in("result", ["won", "lost"]);
    if (outErr) throw new Error(`Failed to load outcomes: ${outErr.message}`);

    const buckets = AUTHORSHIP_BUCKETS.map((b) => {
      const inBucket = (outcomes ?? []).filter((o) => {
        const pct = pctById.get(o.submission_id);
        return pct != null && pct >= b.min && pct <= b.max;
      });
      const won = inBucket.filter((o) => o.result === "won").length;
      const decided = inBucket.length;
      return {
        ...b,
        won,
        decided,
        winRatePct: decided >= MIN_SAMPLE_FOR_RATE ? Math.round((won / decided) * 100) : null,
      };
    });

    return { buckets, totalDecided: (outcomes ?? []).length };
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
