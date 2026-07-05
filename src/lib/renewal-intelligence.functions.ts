"use server";

/**
 * Renewal Intelligence
 *
 * Predicts which grants are likely to be renewed, calculates renewal likelihood,
 * and tracks funder patterns for repeat opportunities.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getRenewalCandidates = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: outcomes } = await supabase
    .from("outcomes")
    .select(
      `
        id, result, amount_awarded_cad, decision_date,
        submission:submissions(
          id,
          grant:grants(id, title, funder_id, deadline, amount_min_cad, amount_max_cad),
          proposal:proposals(id, title)
        )
      `,
    )
    .eq("result", "won")
    .order("decision_date", { ascending: false });

  const { data: allGrants } = await supabase
    .from("grants")
    .select("id, title, funder_id, deadline, amount_min_cad, amount_max_cad");

  const funderGrantCount = new Map<string, number>();
  for (const g of allGrants || []) {
    if (g.funder_id) {
      funderGrantCount.set(g.funder_id, (funderGrantCount.get(g.funder_id) || 0) + 1);
    }
  }

  const candidates = (outcomes || []).map((o) => {
    const s = Array.isArray(o.submission) ? o.submission[0] : o.submission;
    const g = Array.isArray(s?.grant) ? s?.grant[0] : s?.grant;
    const p = Array.isArray(s?.proposal) ? s?.proposal[0] : s?.proposal;

    const funderId = g?.funder_id || "";
    const funderPrograms = funderGrantCount.get(funderId) || 0;

    const decisionDate = o.decision_date ? new Date(o.decision_date) : null;
    const daysSinceDecision = decisionDate
      ? Math.round((Date.now() - decisionDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    let renewalLikelihood: "high" | "medium" | "low" = "low";
    if (funderPrograms > 3 && daysSinceDecision > 180) renewalLikelihood = "high";
    else if (funderPrograms > 1 || daysSinceDecision > 365) renewalLikelihood = "medium";

    return {
      outcomeId: o.id,
      grantTitle: g?.title || "Unknown",
      proposalTitle: p?.title || "Unknown",
      amount: o.amount_awarded_cad,
      decisionDate: o.decision_date,
      daysSinceDecision,
      funderPrograms,
      renewalLikelihood,
    };
  });

  return candidates.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.renewalLikelihood] - order[b.renewalLikelihood];
  });
});

export const getRenewalStats = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: outcomes } = await supabase
    .from("outcomes")
    .select("result, amount_awarded_cad, decision_date");

  const won = outcomes?.filter((o) => o.result === "won") || [];
  const totalAwarded = won.reduce((s, o) => s + (o.amount_awarded_cad || 0), 0);

  const { data: grants } = await supabase.from("grants").select("id, funder_id");
  const funderSet = new Set(grants?.map((g) => g.funder_id).filter(Boolean));

  return {
    totalWon: won.length,
    totalAwarded,
    uniqueFunders: funderSet.size,
    avgGrantSize: won.length > 0 ? Math.round(totalAwarded / won.length) : 0,
  };
});
