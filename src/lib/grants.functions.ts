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
  .inputValidator((i) =>
    z.object({
      funderIds: z.array(z.string().uuid()).optional(),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("discoverer");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let fq = supabaseAdmin
      .from("funders")
      .select("id")
      .eq("active", true)
      .not("source_url", "is", null);
    if (data.funderIds && data.funderIds.length > 0) fq = fq.in("id", data.funderIds);
    const { data: funders, error } = await fq;
    if (error) throw new Error(error.message);

    const jobId = crypto.randomUUID();
    const queued = funders?.length ?? 0;

    // Kick off background work without awaiting. The orchestrator logs every
    // attempt, success and failure into agent_runs tagged with this job_id.
    const { runDiscoveryJob } = await import("@/agents/discoverer-orchestrator.server");
    void runDiscoveryJob(jobId, context.userId, data.funderIds).catch((e) => {
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

// List active funders with a discoverable source_url. Used by the admin UI to
// select which funders to run in the next discovery job.
export const listActiveFunders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("funders")
      .select("id, name, name_fr, jurisdiction")
      .eq("active", true)
      .not("source_url", "is", null)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { funders: data ?? [] };
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

// ---------------------------------------------------------------------------
// NotebookLM bridge: export a markdown bundle of curated-ready grants.
// Returns a single concatenated markdown document (≤ ~50 sources) that the
// curator drops into NotebookLM as a single source, plus a JSON index for
// audit. NotebookLM has no public API, so we optimize for copy/paste UX.
// ---------------------------------------------------------------------------
export const exportGrantsForNotebookLM = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      status: z.enum(["discovered", "enriched", "scored", "shortlisted"]).default("discovered"),
      limit: z.number().int().min(1).max(50).default(25),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("grants")
      .select("id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, language, url, status, sectors, funder:funders(name, jurisdiction)")
      .eq("status", data.status)
      .order("discovered_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const fmt = (n: number | null) => n == null ? "—" : `CAD ${n.toLocaleString("en-CA")}`;
    const parts: string[] = [
      `# IIAL Curation Bundle — ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `Status filter: \`${data.status}\` · Count: ${rows?.length ?? 0}`,
      ``,
      `> Drop this markdown into NotebookLM as a single source. Each grant is delimited by \`---\`. Use the IDs below to mark curated items via the "Mark as curated" action in /grants.`,
      ``,
    ];
    const index: Array<{ id: string; title: string; url: string }> = [];

    for (const g of rows ?? []) {
      const r = g as unknown as {
        id: string; title: string; title_fr: string | null; summary: string | null; summary_fr: string | null;
        amount_cad_min: number | null; amount_cad_max: number | null; deadline: string | null;
        language: string; url: string; status: string; sectors: string[] | null;
        funder: { name: string; jurisdiction: string | null } | { name: string; jurisdiction: string | null }[] | null;
      };
      const funder = Array.isArray(r.funder) ? r.funder[0] : r.funder;
      index.push({ id: r.id, title: r.title, url: r.url });
      parts.push(
        `---`,
        ``,
        `## ${r.title}${r.title_fr ? ` / ${r.title_fr}` : ""}`,
        ``,
        `- **IIAL id**: \`${r.id}\``,
        `- **Funder**: ${funder?.name ?? "—"}${funder?.jurisdiction ? ` (${funder.jurisdiction})` : ""}`,
        `- **Amount**: ${fmt(r.amount_cad_min)} – ${fmt(r.amount_cad_max)}`,
        `- **Deadline**: ${r.deadline ?? "—"}`,
        `- **Language**: ${r.language}`,
        `- **Sectors**: ${(r.sectors ?? []).join(", ") || "—"}`,
        `- **Source**: ${r.url}`,
        ``,
        r.summary ? `${r.summary}` : "_(no summary)_",
        r.summary_fr ? `\n\n_(FR)_ ${r.summary_fr}` : "",
        ``,
      );
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: rows?.length ?? 0,
      markdown: parts.join("\n"),
      index,
    };
  });

// Curator action: mark a list of grant IDs as shortlisted, with optional note.
// Records who curated it and the note inside grant_events for full audit.
export const markGrantsCurated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      grantIds: z.array(z.string().uuid()).min(1).max(50),
      note: z.string().max(2000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ts = new Date().toISOString();
    let updated = 0;
    for (const id of data.grantIds) {
      const { data: prev } = await supabaseAdmin.from("grants").select("status").eq("id", id).maybeSingle();
      const fromStatus = (prev as { status?: string } | null)?.status ?? null;
      const { error: uerr } = await supabaseAdmin
        .from("grants")
        .update({ status: "shortlisted", updated_at: ts } as never)
        .eq("id", id);
      if (uerr) continue;
      updated++;
      await supabaseAdmin.from("grant_events").insert({
        grant_id: id,
        from_status: (fromStatus ?? null) as never,
        to_status: "shortlisted" as never,
        actor_user_id: context.userId,
        metadata: { source: "curator_notebooklm", note: data.note ?? null } as never,
      });
    }
    return { ok: true, updated };
  });

