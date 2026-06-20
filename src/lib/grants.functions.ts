import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

// List grants from the public catalog, sorted by deadline asc / fit_score desc.
export const listGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z
          .enum([
            "discovered", "enriched", "scored", "shortlisted",
            "in_proposal", "submitted", "won", "lost", "expired", "archived",
          ])
          .optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("grants")
      .select("id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, sectors, language, url, status, fit_score, funder:funders(name, name_fr, jurisdiction)")
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { grants: rows ?? [] };
  });

// Admin-triggered orchestration: run Discoverer for every active funder, then
// auto-Enrich every grant left in 'discovered' state. Mirrors the cron hook
// but is callable from the UI for demos and manual re-syncs.
export const discoverAllFunders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("discoverer");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runDiscoverer } = await import("@/agents/discoverer.functions");
    const { runEnricher } = await import("@/agents/enricher.functions");

    const { data: funders, error } = await supabaseAdmin
      .from("funders")
      .select("id, name")
      .eq("active", true)
      .not("source_url", "is", null);
    if (error) throw new Error(error.message);

    let totalInserted = 0;
    const perFunder: Array<{ funder: string; inserted: number; error?: string }> = [];

    for (const f of funders ?? []) {
      try {
        const r = await runDiscoverer({ data: { funderId: f.id } });
        const ins = typeof r === "object" && r && "inserted" in r ? Number(r.inserted) : 0;
        totalInserted += ins;
        perFunder.push({ funder: f.name, inserted: ins });
      } catch (e) {
        perFunder.push({ funder: f.name, inserted: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Auto-enrich anything still 'discovered' (best effort; skip on failure).
    let enriched = 0;
    try {
      await assertAgentEnabled("enricher");
      const { data: pending } = await supabaseAdmin
        .from("grants")
        .select("id")
        .eq("status", "discovered")
        .limit(50);
      for (const g of pending ?? []) {
        try {
          await runEnricher({ data: { grantId: g.id } });
          enriched++;
        } catch { /* keep going */ }
      }
    } catch { /* enricher disabled or unavailable */ }

    return { ok: true, totalInserted, enriched, perFunder };
  });

// Admin-triggered enrichment of a single grant.
export const enrichGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ grantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("enricher");
    const { runEnricher } = await import("@/agents/enricher.functions");
    return runEnricher({ data: { grantId: data.grantId } });
  });
