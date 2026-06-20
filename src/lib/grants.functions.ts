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

// Admin-triggered orchestration: fire-and-forget. Returns a jobId immediately
// so the UI doesn't depend on keeping the connection open during the entire
// orchestration. Per-funder runs (with retries and timeouts) are logged into
// agent_runs tagged with metadata.job_id. Query progress via
// getDiscoveryJobStatus({ jobId }).
export const discoverAllFunders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("discoverer");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: funders, error } = await supabaseAdmin
      .from("funders")
      .select("id")
      .eq("active", true)
      .not("source_url", "is", null);
    if (error) throw new Error(error.message);

    const jobId = crypto.randomUUID();
    const queued = funders?.length ?? 0;

    // Kick off background work without awaiting. The orchestrator logs every
    // attempt, success and failure into agent_runs tagged with this job_id.
    const { runDiscoveryJob } = await import("@/agents/discoverer-orchestrator.server");
    void runDiscoveryJob(jobId, context.userId).catch((e) => {
      console.error("[discoverAllFunders] background job crashed", e);
    });

    // Standardized payload: always includes totalInserted/totalProcessed even
    // when delivered in queued mode (zero until the background job updates).
    return {
      ok: true,
      jobId,
      queued,
      totalInserted: 0,
      totalSeenAgain: 0,
      totalProcessed: 0,
      evaluated: 0,
      perFunder: [] as Array<{ funder: string; inserted: number; seenAgain?: number; engine?: string; error?: string }>,
      status: "queued" as const,
    };
  });

// Aggregated status of a discovery job, computed from agent_runs rows tagged
// with metadata.job_id. Used by the UI progress panel.
export const getDiscoveryJobStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("agent_runs")
      .select("run_id, status, error, latency_ms, metadata, created_at")
      .eq("agent", "discoverer")
      .filter("metadata->>job_id", "eq", data.jobId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    type Row = { run_id: string; status: string; error: string | null; latency_ms: number | null; metadata: Record<string, unknown> | null; created_at: string };
    const all = (rows ?? []) as unknown as Row[];

    let started_at: string | null = null;
    let completed_at: string | null = null;
    let status: "queued" | "running" | "completed" | "failed" = "queued";
    let totalInserted = 0;
    let totalSeenAgain = 0;
    let totalProcessed = 0;
    let evaluated = 0;
    let fundersQueued = 0;

    type FunderState = {
      funder_id: string;
      funder_name: string;
      status: "queued" | "running" | "succeeded" | "failed" | "degraded";
      attempts: number;
      inserted: number;
      seenAgain: number;
      engine?: string;
      lastError?: string;
      latency_ms?: number;
    };
    const byFunder = new Map<string, FunderState>();

    for (const r of all) {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      const stage = typeof m.stage === "string" ? m.stage : undefined;
      if (stage === "orchestrator_started") {
        started_at = r.created_at;
        if (status === "queued") status = "running";
        continue;
      }
      if (stage === "orchestrator_completed") {
        completed_at = r.created_at;
        status = "completed";
        totalInserted = Number(m.totalInserted ?? 0);
        totalSeenAgain = Number(m.totalSeenAgain ?? 0);
        totalProcessed = Number(m.totalProcessed ?? 0);
        evaluated = Number(m.evaluated ?? 0);
        fundersQueued = Number(m.funders_queued ?? 0);
        continue;
      }
      const fid = typeof m.funder_id === "string" ? m.funder_id : null;
      if (!fid) continue;
      const fname = typeof m.funder_name === "string" ? m.funder_name : fid.slice(0, 8);
      const prev = byFunder.get(fid) ?? {
        funder_id: fid, funder_name: fname, status: "running" as const,
        attempts: 0, inserted: 0, seenAgain: 0,
      };
      prev.attempts = Math.max(prev.attempts, Number(m.attempt ?? 1));
      if (r.status === "succeeded") {
        prev.status = "succeeded";
        prev.inserted = Number(m.inserted ?? 0);
        prev.seenAgain = Number(m.seen_again ?? 0);
        prev.engine = typeof m.engine === "string" ? m.engine : prev.engine;
        prev.latency_ms = r.latency_ms ?? prev.latency_ms;
      } else if (r.status === "failed") {
        prev.status = "failed";
        prev.lastError = r.error ?? prev.lastError;
      } else if (r.status === "degraded") {
        prev.lastError = r.error ?? prev.lastError;
        if (prev.status !== "succeeded") prev.status = "running";
      }
      byFunder.set(fid, prev);
    }

    return {
      jobId: data.jobId,
      status,
      started_at,
      completed_at,
      fundersQueued,
      totalInserted,
      totalSeenAgain,
      totalProcessed,
      evaluated,
      perFunder: [...byFunder.values()],
    };
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
