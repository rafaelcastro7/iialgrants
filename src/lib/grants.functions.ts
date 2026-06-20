import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

// List grants from the public catalog, sorted by deadline asc / fit_score desc.
// Also returns the calling user's per-grant evaluation (if any), so the UI can
// render the fit verdict + rationale alongside each card.
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
      .select("id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, sectors, language, url, status, fit_score, discovered_at, enriched_at, scored_at, funder:funders(name, name_fr, jurisdiction)")
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const grants = rows ?? [];

    const ids = grants.map((g) => g.id);
    let evalsByGrant = new Map<string, {
      fit_score: number;
      eligibility_pass: boolean;
      rationale_en: string;
      rationale_fr: string;
      created_at: string;
    }>();
    if (ids.length > 0) {
      const { data: evals } = await context.supabase
        .from("grant_evaluations")
        .select("grant_id, fit_score, eligibility_pass, rationale_en, rationale_fr, created_at")
        .eq("user_id", context.userId)
        .in("grant_id", ids);
      for (const e of evals ?? []) {
        evalsByGrant.set(e.grant_id, {
          fit_score: Number(e.fit_score),
          eligibility_pass: !!e.eligibility_pass,
          rationale_en: e.rationale_en ?? "",
          rationale_fr: e.rationale_fr ?? "",
          created_at: e.created_at,
        });
      }
    }

    return {
      grants: grants.map((g) => ({ ...g, evaluation: evalsByGrant.get(g.id) ?? null })),
    };
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

// Auto-evaluate every enriched/scored grant that the calling user has NOT yet
// evaluated. Runs the Evaluator agent sequentially (cheap Gemini Flash call)
// so the UI can show a fit verdict immediately after discovery.
// Requires the user to have an org_profile; otherwise returns a no-op.
export const autoEvaluatePending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ limit: z.number().int().min(1).max(25).default(10) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Need an org profile, otherwise the evaluator would throw.
    const { data: org } = await context.supabase
      .from("org_profiles")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!org) return { ok: true, evaluated: 0, skipped: 0, reason: "org_profile_missing" as const };

    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    try {
      await assertAgentEnabled("evaluator");
    } catch {
      return { ok: true, evaluated: 0, skipped: 0, reason: "evaluator_disabled" as const };
    }

    const { data: candidates } = await context.supabase
      .from("grants")
      .select("id, status")
      .in("status", ["enriched", "scored", "shortlisted"])
      .limit(data.limit * 3);

    const ids = (candidates ?? []).map((g) => g.id);
    if (ids.length === 0) return { ok: true, evaluated: 0, skipped: 0 };

    const { data: existing } = await context.supabase
      .from("grant_evaluations")
      .select("grant_id")
      .eq("user_id", context.userId)
      .in("grant_id", ids);
    const done = new Set((existing ?? []).map((e) => e.grant_id));
    const todo = ids.filter((id) => !done.has(id)).slice(0, data.limit);

    if (todo.length === 0) return { ok: true, evaluated: 0, skipped: 0 };

    const { runEvaluator } = await import("@/agents/evaluator.functions");
    let evaluated = 0;
    let skipped = 0;
    for (const grantId of todo) {
      try {
        await runEvaluator({ data: { grantId } });
        evaluated++;
      } catch {
        skipped++;
      }
    }
    return { ok: true, evaluated, skipped };
  });
