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
    const { discoverFunderImpl } = await import("@/agents/discoverer.impl.server");

    const { data: funders, error } = await supabaseAdmin
      .from("funders")
      .select("id, name")
      .eq("active", true)
      .not("source_url", "is", null);
    if (error) throw new Error(error.message);

    let totalInserted = 0;
    let totalSeenAgain = 0;
    const perFunder: Array<{ funder: string; inserted: number; seenAgain?: number; engine?: string; error?: string }> = [];

    for (const f of funders ?? []) {
      try {
        const r = await discoverFunderImpl(f.id);
        totalInserted += r.inserted; totalSeenAgain += r.seenAgain ?? 0;
        perFunder.push({ funder: f.name, inserted: r.inserted, seenAgain: r.seenAgain, engine: r.engine });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        perFunder.push({ funder: f.name, inserted: 0, error: msg });
        try {
          await supabaseAdmin.from("agent_runs").insert({
            run_id: crypto.randomUUID(), agent: "discoverer", status: "failed",
            model: "google/gemini-2.5-flash", error: msg,
            metadata: { funder_id: f.id, funder_name: f.name, stage: "orchestrator" },
          });
        } catch { /* logging best-effort */ }
      }
    }

    // Skip Enrich — auto-fit runs on 'discovered' directly. Enrich becomes
    // background-only (cron) for FR-CA translation when shortlisted.

    // Auto-evaluate fit for the admin who triggered this run (best effort).
    let evaluated = 0;
    try {
      const { data: org } = await context.supabase
        .from("org_profiles").select("user_id").eq("user_id", context.userId).maybeSingle();
      if (org) {
        const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
        await assertAgentEnabled("evaluator");
        const { evaluateGrantImpl } = await import("@/agents/evaluator.impl.server");
        const { data: pending } = await supabaseAdmin
          .from("grants").select("id").eq("status", "discovered").limit(15);
        for (const g of pending ?? []) {
          try { await evaluateGrantImpl({ grantId: g.id, userId: context.userId, userSupabase: context.supabase }); evaluated++; }
          catch { /* keep going */ }
        }
      }
    } catch { /* evaluator disabled */ }

    return { ok: true, totalInserted, totalSeenAgain, evaluated, perFunder };
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
      .in("status", ["discovered", "enriched", "scored", "shortlisted"])
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

    const { evaluateGrantImpl } = await import("@/agents/evaluator.impl.server");
    let evaluated = 0;
    let skipped = 0;
    for (const grantId of todo) {
      try {
        await evaluateGrantImpl({ grantId, userId: context.userId, userSupabase: context.supabase });
        evaluated++;
      } catch {
        skipped++;
      }
    }
    return { ok: true, evaluated, skipped };
  });

// List recent agent_runs (and recent grant_events) for the live event panel.
// Admin-only because it includes failure messages and tokens.
export const listAgentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
      agent: z.string().optional(),
      status: z.enum(["succeeded", "failed", "degraded", "running"]).optional(),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("agent_runs")
      .select("id, run_id, agent, status, model, latency_ms, input_tokens, output_tokens, error, metadata, grant_id, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.agent) q = q.eq("agent", data.agent as "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic");
    if (data.status) q = q.eq("status", data.status);
    const { data: runs, error } = await q;
    if (error) throw new Error(error.message);

    const { data: events } = await supabaseAdmin
      .from("grant_events")
      .select("id, grant_id, from_status, to_status, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(25);

    return { runs: runs ?? [], events: events ?? [] };
  });
