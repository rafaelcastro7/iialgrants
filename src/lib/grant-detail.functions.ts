import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Single-grant detail fetch for the drill-down page (/grants/$id).
// Joins funder, eligibility, sectors, and the calling user's own evaluation +
// timeline events for full context.
export const getGrantDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: grant, error } = await context.supabase
      .from("grants")
      .select(
        "id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, sectors, eligibility, requirements, language, url, status, fit_score, discovered_at, enriched_at, scored_at, last_seen_at, times_seen, enrich_attempts, enrich_last_error, funder:funders(id, name, name_fr, jurisdiction, source_url)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!grant) throw new Error("Grant not found");

    const { data: evaluation } = await context.supabase
      .from("grant_evaluations")
      .select("fit_score, eligibility_pass, rationale_en, rationale_fr, axis_breakdown, created_at")
      .eq("user_id", context.userId)
      .eq("grant_id", data.id)
      .maybeSingle();

    const { data: events } = await context.supabase
      .from("grant_events")
      .select("from_status, to_status, metadata, created_at")
      .eq("grant_id", data.id)
      .order("created_at", { ascending: false })
      .limit(25);

    return { grant, evaluation, events: events ?? [] };
  });
