"use server";

/**
 * Impact Measurement — Post-Award Outcome Tracking
 *
 * Measures community impact, beneficiary reach, and grant effectiveness.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";

export const getImpactMetrics = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
  try {
    const supabase = await createSupabaseAdmin();

    const { data: outcomes } = await supabase
      .from("outcomes")
      .select("result, amount_awarded_cad, decision_date, impact_description");

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
  .inputValidator(z.object({ limit: z.number().min(1).max(100).default(20) }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

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
