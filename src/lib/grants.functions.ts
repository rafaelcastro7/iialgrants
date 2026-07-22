import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";
import { GRANT_STATUSES, canTransition, isGrantStatus } from "@/agents/pipeline-stages.shared";
import { scoreGrantForProfile } from "@/lib/grant-search-profile-ranking.shared";

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
            "discovered",
            "enriched",
            "scored",
            "shortlisted",
            "in_proposal",
            "submitted",
            "won",
            "lost",
            "expired",
            "archived",
          ])
          .optional(),
        search: z.string().trim().max(120).optional(),
        profileId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const profilePromise = data.profileId
      ? context.supabase
          .from("grant_search_profiles")
          .select("*")
          .eq("id", data.profileId)
          .eq("user_id", context.userId)
          .eq("active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const feedbackPromise = data.profileId
      ? context.supabase
          .from("grant_search_feedback")
          .select("grant_id, action")
          .eq("profile_id", data.profileId)
          .eq("user_id", context.userId)
      : Promise.resolve({ data: [], error: null });
    const [{ data: searchProfile, error: profileError }, { data: feedback, error: feedbackError }] =
      await Promise.all([profilePromise, feedbackPromise]);
    if (profileError) throw new Error(profileError.message);
    if (feedbackError) throw new Error(feedbackError.message);
    if (data.profileId && !searchProfile) throw new Error("Search profile not found");

    const feedbackByGrant = new Map((feedback ?? []).map((row) => [row.grant_id, row.action]));
    const rankById = new Map<string, { relevance: number; matched_on: string }>();
    if (data.search && data.search.length >= 2) {
      const { data: ranked, error: searchError } = await context.supabase.rpc(
        "search_grant_catalog",
        { search_query: data.search, result_limit: 100 },
      );
      if (searchError) throw new Error(searchError.message);
      for (const row of ranked ?? []) {
        rankById.set(row.grant_id, { relevance: row.relevance, matched_on: row.matched_on });
      }
      if (rankById.size === 0) return { grants: [] };
    }

    let q = context.supabase
      .from("grants")
      .select(
        "id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, sectors, language, url, status, fit_score, discovered_at, enriched_at, scored_at, funder_id, funder:funders(name, name_fr, jurisdiction)",
      )
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(100);
    if (data.status) q = q.eq("status", data.status);
    if (rankById.size > 0) q = q.in("id", [...rankById.keys()]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const grantsWithProfile = (rows ?? [])
      .map((grant) => {
        const profileMatch = searchProfile ? scoreGrantForProfile(grant, searchProfile) : null;
        const feedbackAction = feedbackByGrant.get(grant.id) ?? null;
        const feedbackBoost =
          feedbackAction === "saved" ? 0.08 : feedbackAction === "pursued" ? 0.12 : 0;
        const lexicalRelevance = rankById.get(grant.id)?.relevance ?? 0;
        const profileRelevance = profileMatch ? profileMatch.score / 100 : 0;
        const combinedRelevance = rankById.size
          ? lexicalRelevance * (searchProfile ? 0.75 : 1) + profileRelevance * 0.25 + feedbackBoost
          : profileRelevance + feedbackBoost;
        return { grant, profileMatch, feedbackAction, combinedRelevance };
      })
      .filter(
        ({ profileMatch, feedbackAction }) =>
          feedbackAction !== "hidden" &&
          feedbackAction !== "rejected" &&
          profileMatch?.hardBlocked !== true,
      )
      .sort(
        (a, b) =>
          b.combinedRelevance - a.combinedRelevance ||
          (b.grant.fit_score ?? 0) - (a.grant.fit_score ?? 0),
      )
      .slice(0, data.limit);
    const grants = grantsWithProfile.map(({ grant }) => grant);

    const ids = grants.map((g) => g.id);
    const evalsByGrant = new Map<
      string,
      {
        fit_score: number;
        eligibility_pass: boolean;
        rationale_en: string;
        rationale_fr: string;
        created_at: string;
      }
    >();
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

    // Duplicate-record signal: group by (funder_id, normalized title) — the
    // canonical_key unique index only protects rows where canonical_key was
    // actually set (a test-seed bug left ~17 rows with canonical_key NULL,
    // see docs/HANDOFF or memory), so a canonical_key-only check misses
    // exactly the contaminated rows a user most needs warned about. This is
    // read-only UI signal, not a dedup/merge — no data is changed here.
    const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
    const normalizeTitle = (t: string) =>
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(DIACRITICS, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const groupCounts = new Map<string, number>();
    for (const g of grants) {
      const key = `${g.funder_id ?? "none"}|${normalizeTitle(g.title)}`;
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }

    return {
      grants: grantsWithProfile.map(
        ({ grant: g, profileMatch, feedbackAction, combinedRelevance }) => ({
          ...g,
          searchMatch: rankById.get(g.id) ?? null,
          profileMatch,
          feedbackAction,
          combinedRelevance,
          evaluation: evalsByGrant.get(g.id) ?? null,
          duplicateGroupSize:
            groupCounts.get(`${g.funder_id ?? "none"}|${normalizeTitle(g.title)}`) ?? 1,
        }),
      ),
    };
  });

export const searchCommandGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        term: z.string().trim().min(2).max(80),
        limit: z.number().int().min(1).max(10).default(5),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const term = data.term
      .replace(/[%*,()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (term.length < 2) return { grants: [] };

    const { data: rows, error } = await context.supabase
      .from("grants")
      .select("id, title, summary, status, deadline, funder:funders(name)")
      .or(`title.ilike.%${term}%,summary.ilike.%${term}%`)
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { grants: rows ?? [] };
  });

// Admin-triggered orchestration: fire-and-forget. Returns a jobId immediately
// so the UI doesn't depend on keeping the connection open during the entire
// orchestration. Per-funder runs (with retries and timeouts) are logged into
// agent_runs tagged with metadata.job_id. Query progress via
// getDiscoveryJobStatus({ jobId }).
export const discoverAllFunders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        funderIds: z.array(z.string().uuid()).optional(),
      })
      .parse(i ?? {}),
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

    // Run inline. Fire-and-forget promises are terminated by the Worker
    // runtime as soon as the response is sent, which previously made the
    // "Run discovery now" button look like a no-op. The orchestrator already
    // caps per-funder latency and retries internally.
    const { runDiscoveryJob } = await import("@/agents/discoverer-orchestrator.server");
    let result: Awaited<ReturnType<typeof runDiscoveryJob>> | null = null;
    let runError: string | null = null;
    try {
      result = await runDiscoveryJob(jobId, context.userId, data.funderIds, { forceRefresh: true });
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
      console.error("[discoverAllFunders] orchestrator threw", e);
    }

    return {
      ok: runError == null,
      jobId,
      queued,
      totalInserted: result?.totalInserted ?? 0,
      totalSeenAgain: result?.totalSeenAgain ?? 0,
      totalProcessed: result?.totalProcessed ?? queued,
      totalDegraded: result?.totalDegraded ?? 0,
      totalFailed: result?.totalFailed ?? (runError ? queued : 0),
      evaluated: result?.evaluated ?? 0,
      perFunder: result?.perFunder ?? [],
      status: (runError ? "failed" : "completed") as "completed" | "failed",
      error: runError,
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
type DiscoveryRunRow = {
  run_id: string;
  status: string;
  error: string | null;
  latency_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DiscoveryFunderState = {
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

const DISCOVERY_STALE_AFTER_MS = Number(process.env.DISCOVERY_STALE_AFTER_MS ?? 120_000);

export function summarizeDiscoveryJobRows(
  jobId: string,
  all: DiscoveryRunRow[],
  opts: { now?: Date; staleAfterMs?: number } = {},
) {
  let started_at: string | null = null;
  let completed_at: string | null = null;
  let status: "queued" | "running" | "completed" | "failed" = "queued";
  let totalInserted = 0;
  let totalSeenAgain = 0;
  let totalProcessed = 0;
  let totalDegraded = 0;
  let totalFailed = 0;
  let evaluated = 0;
  let fundersQueued = 0;
  let completedMarkerAt: string | null = null;
  let latestFunderRowAt: string | null = null;
  let latestRowAt: string | null = null;

  const byFunder = new Map<string, DiscoveryFunderState>();

  for (const r of all) {
    if (latestRowAt == null || r.created_at > latestRowAt) latestRowAt = r.created_at;
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const stage = typeof m.stage === "string" ? m.stage : undefined;
    if (stage === "orchestrator_started") {
      started_at = r.created_at;
      if (status === "queued") status = "running";
      fundersQueued = Number(m.funders_queued ?? fundersQueued);
      continue;
    }
    if (stage === "orchestrator_completed") {
      completed_at = r.created_at;
      completedMarkerAt = r.created_at;
      status = "completed";
      totalInserted = Number(m.totalInserted ?? 0);
      totalSeenAgain = Number(m.totalSeenAgain ?? 0);
      totalProcessed = Number(m.totalProcessed ?? 0);
      evaluated = Number(m.evaluated ?? 0);
      totalDegraded = Number(m.totalDegraded ?? 0);
      totalFailed = Number(m.totalFailed ?? 0);
      fundersQueued = Number(m.funders_queued ?? 0);
      continue;
    }
    const fid = typeof m.funder_id === "string" ? m.funder_id : null;
    if (!fid) continue;
    latestFunderRowAt = r.created_at;
    const fname = typeof m.funder_name === "string" ? m.funder_name : fid.slice(0, 8);
    const prev = byFunder.get(fid) ?? {
      funder_id: fid,
      funder_name: fname,
      status: "running" as const,
      attempts: 0,
      inserted: 0,
      seenAgain: 0,
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
      if (prev.status !== "succeeded") prev.status = "degraded";
    }
    byFunder.set(fid, prev);
  }

  const perFunder = [...byFunder.values()];
  const completedBeforeLatestFunder =
    completedMarkerAt != null && latestFunderRowAt != null && completedMarkerAt < latestFunderRowAt;

  // Discovery can be interrupted by local runner shutdowns or timeout races.
  // In that case the database may contain a terminal marker followed by late
  // per-funder rows. The UI should prefer the observed funder facts over a
  // stale aggregate marker, otherwise it shows "completed" with impossible
  // totals (for example 0 inserted while a later funder row inserted grants).
  if (completedBeforeLatestFunder || (status !== "completed" && perFunder.length > 0)) {
    totalInserted = perFunder.reduce((sum, f) => sum + f.inserted, 0);
    totalSeenAgain = perFunder.reduce((sum, f) => sum + f.seenAgain, 0);
    totalProcessed = perFunder.filter((f) =>
      ["succeeded", "degraded", "failed"].includes(f.status),
    ).length;
    totalDegraded = perFunder.filter((f) => f.status === "degraded").length;
    totalFailed = perFunder.filter((f) => f.status === "failed").length;
  }

  const now = opts.now ?? new Date();
  const staleAfterMs = opts.staleAfterMs ?? DISCOVERY_STALE_AFTER_MS;
  const latestMs = latestRowAt ? new Date(latestRowAt).getTime() : null;
  const stale =
    status === "running" &&
    latestMs != null &&
    Number.isFinite(latestMs) &&
    now.getTime() - latestMs > staleAfterMs;
  if (stale) {
    status = "failed";
    const observedProcessed = perFunder.filter((f) =>
      ["succeeded", "degraded", "failed"].includes(f.status),
    ).length;
    totalProcessed = observedProcessed;
    totalDegraded = perFunder.filter((f) => f.status === "degraded").length;
    totalFailed = Math.max(
      totalFailed,
      Math.max((fundersQueued || observedProcessed) - observedProcessed, 0),
    );
  }

  return {
    jobId,
    status,
    started_at,
    completed_at,
    fundersQueued,
    totalInserted,
    totalSeenAgain,
    totalProcessed,
    totalDegraded,
    totalFailed,
    evaluated,
    perFunder,
  };
}

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

    return summarizeDiscoveryJobRows(data.jobId, (rows ?? []) as unknown as DiscoveryRunRow[]);
  });

// On-demand enrichment of a single grant. Available to any authenticated user
// — enrichment only scrapes the public funder URL and writes structured fields
// + evidence back, so it is safe to expose. The agent's own kill-switch
// (`assertAgentEnabled`) still applies.
export const enrichGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ grantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: flag, error: flagError } = await context.supabase
      .from("agent_flags" as never)
      .select("enabled")
      .eq("agent", "enricher")
      .maybeSingle();
    if (flagError) throw new Error(flagError.message);
    if (!flag || !(flag as { enabled?: boolean }).enabled) {
      throw new Error("agent_disabled:enricher");
    }
    const { enrichGrantImpl } = await import("@/agents/enricher.functions");
    return enrichGrantImpl(data.grantId, {
      db: context.supabase as never,
      userId: context.userId,
    });
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
      await assertAgentEnabled("evaluator", context.supabase as never);
    } catch {
      return { ok: true, evaluated: 0, skipped: 0, reason: "evaluator_disabled" as const };
    }

    const { data: candidates } = await context.supabase
      .from("grants")
      .select("id, status")
      // "discovered" is deliberately excluded: evaluateGrantImpl rejects it
      // with grant_not_enriched_yet, so including it here only wastes a
      // round-trip that always gets counted as skipped.
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

    const { evaluateGrantImpl } = await import("@/agents/evaluator.impl.server");
    let evaluated = 0;
    let skipped = 0;
    for (const grantId of todo) {
      try {
        await evaluateGrantImpl({
          grantId,
          userId: context.userId,
          userSupabase: context.supabase,
        });
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
    z
      .object({
        limit: z.number().int().min(1).max(200).default(50),
        agent: z.string().optional(),
        status: z.enum(["succeeded", "failed", "degraded", "running"]).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("agent_runs")
      .select(
        "id, run_id, agent, status, model, latency_ms, input_tokens, output_tokens, error, metadata, grant_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.agent)
      q = q.eq(
        "agent",
        data.agent as "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic",
      );
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
    z
      .object({
        status: z.enum(["discovered", "enriched", "scored", "shortlisted"]).default("discovered"),
        limit: z.number().int().min(1).max(50).default(25),
        autoEnrich: z.boolean().default(false),
        force: z.boolean().default(false),
        // Language filter: 'auto' = use the curator's preferred_lang from profile,
        // 'en'/'fr' = explicit, 'all' = both (legacy behaviour, can be noisy).
        language: z.enum(["auto", "en", "fr", "all"]).default("auto"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve target language from the curator's profile when 'auto'.
    let lang: "en" | "fr" | "all" = data.language === "auto" ? "en" : data.language;
    if (data.language === "auto") {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("preferred_lang")
        .eq("id", context.userId)
        .maybeSingle();
      const pl = (prof as { preferred_lang?: string } | null)?.preferred_lang;
      if (pl === "en" || pl === "fr") lang = pl;
    }

    const selectCols =
      "id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, language, url, status, sectors, funder:funders(id, name, jurisdiction)";
    type Row = {
      id: string;
      title: string;
      title_fr: string | null;
      summary: string | null;
      summary_fr: string | null;
      amount_cad_min: number | null;
      amount_cad_max: number | null;
      deadline: string | null;
      language: string;
      url: string;
      status: string;
      sectors: string[] | null;
      funder:
        | { id: string; name: string; jurisdiction: string | null }
        | { id: string; name: string; jurisdiction: string | null }[]
        | null;
    };

    async function fetchRows(): Promise<Row[]> {
      let q = supabaseAdmin
        .from("grants")
        .select(selectCols)
        .eq("status", data.status)
        .order("discovered_at", { ascending: false })
        .limit(data.limit);
      if (lang !== "all") q = q.eq("language", lang);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return (rows ?? []) as unknown as Row[];
    }

    const isIncomplete = (r: Row) =>
      (r.amount_cad_min == null && r.amount_cad_max == null) ||
      !r.deadline ||
      !r.sectors ||
      r.sectors.length === 0;

    let rows = await fetchRows();
    const incompleteIds = rows.filter(isIncomplete).map((r) => r.id);

    // Pre-export validation: if a meaningful share of rows is missing
    // amount/deadline/sectors, refuse to export unless the curator forces it
    // or asks us to auto-enrich first.
    const INCOMPLETE_THRESHOLD = 0.5;
    const incompleteRatio = rows.length > 0 ? incompleteIds.length / rows.length : 0;

    let enrichmentReport: { attempted: number; succeeded: number; failed: number } | null = null;
    if (incompleteIds.length > 0 && data.autoEnrich) {
      const { enrichGrantImpl } = await import("@/agents/enricher.functions");
      const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
      await assertAgentEnabled("enricher", context.supabase as never);
      let succeeded = 0;
      let failed = 0;
      // Cap to keep the request bounded; the rest can be re-tried in a follow-up export.
      const batch = incompleteIds.slice(0, 10);
      for (const id of batch) {
        try {
          await enrichGrantImpl(id, {
            db: context.supabase as never,
            userId: context.userId,
          });
          succeeded++;
        } catch {
          failed++;
        }
      }
      enrichmentReport = { attempted: batch.length, succeeded, failed };
      rows = await fetchRows();
    } else if (incompleteRatio >= INCOMPLETE_THRESHOLD && !data.force) {
      return {
        ok: false as const,
        needsEnrich: true as const,
        reason: "incomplete_grants",
        total: rows.length,
        incompleteIds,
        message: `${incompleteIds.length}/${rows.length} grants are missing amount, deadline or sectors. Enrich them first, or re-call with { force: true } to export as-is.`,
      };
    }

    const fmt = (n: number | null) => (n == null ? "—" : `CAD ${n.toLocaleString("en-CA")}`);
    const isValidHttpUrl = (u: string): boolean => {
      try {
        const p = new URL(u);
        return p.protocol === "http:" || p.protocol === "https:";
      } catch {
        return false;
      }
    };

    const parts: string[] = [
      `# IIAL Curation Bundle — ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `Status filter: \`${data.status}\` · Language: \`${lang}\` · Count: ${rows.length}`,
      ``,
      `> Drop this markdown into NotebookLM as a single source. Each grant is delimited by \`---\`. Use the IDs below to mark curated items via the "Mark as curated" action in /grants.`,
      ``,
    ];
    const index: Array<{ id: string; title: string; url: string }> = [];

    // Quality counters for the trailing summary.
    let withAmount = 0,
      withDeadline = 0,
      withSectors = 0;
    let invalidUrls = 0,
      missingFunder = 0;
    const issues: string[] = [];
    const funderCounts = new Map<string, number>();

    for (const r of rows) {
      const funder = Array.isArray(r.funder) ? r.funder[0] : r.funder;
      const funderName = funder?.name ?? null;
      if (!funder || !funder.id || !funderName) {
        missingFunder++;
        issues.push(`- \`${r.id}\` — missing funder join`);
      } else {
        funderCounts.set(funderName, (funderCounts.get(funderName) ?? 0) + 1);
      }
      const urlOk = isValidHttpUrl(r.url);
      if (!urlOk) {
        invalidUrls++;
        issues.push(`- \`${r.id}\` — invalid source URL: ${r.url}`);
      }

      const hasAmount = r.amount_cad_min != null || r.amount_cad_max != null;
      const hasDeadline = !!r.deadline;
      const hasSectors = !!r.sectors && r.sectors.length > 0;
      if (hasAmount) withAmount++;
      if (hasDeadline) withDeadline++;
      if (hasSectors) withSectors++;

      // Cosmetic: only append title_fr when it actually differs from title.
      const titleSuffix =
        r.title_fr && r.title_fr.trim() && r.title_fr.trim() !== r.title.trim()
          ? ` / ${r.title_fr}`
          : "";

      index.push({ id: r.id, title: r.title, url: r.url });
      parts.push(
        `---`,
        ``,
        `## ${r.title}${titleSuffix}`,
        ``,
        `- **IIAL id**: \`${r.id}\``,
        `- **Funder**: ${funderName ?? "⚠ missing"}${funder?.jurisdiction ? ` (${funder.jurisdiction})` : ""}`,
        `- **Amount**: ${fmt(r.amount_cad_min)} – ${fmt(r.amount_cad_max)}`,
        `- **Deadline**: ${r.deadline ?? "—"}`,
        `- **Language**: ${r.language}`,
        `- **Sectors**: ${(r.sectors ?? []).join(", ") || "—"}`,
        `- **Source**: ${urlOk ? r.url : `⚠ invalid (${r.url})`}`,
        ``,
        r.summary ? `${r.summary}` : "_(no summary)_",
        r.summary_fr && r.summary_fr.trim() !== (r.summary ?? "").trim()
          ? `\n\n_(FR)_ ${r.summary_fr}`
          : "",
        ``,
      );
    }

    // Trailing quality summary so the curator sees at a glance what's clean.
    const total = rows.length || 1;
    const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
    parts.push(
      `---`,
      ``,
      `## Bundle quality summary`,
      ``,
      `- Total grants: ${rows.length}`,
      `- With amount: ${withAmount} (${pct(withAmount)})`,
      `- With deadline: ${withDeadline} (${pct(withDeadline)})`,
      `- With sectors: ${withSectors} (${pct(withSectors)})`,
      `- Invalid source URLs: ${invalidUrls}`,
      `- Missing funder join: ${missingFunder}`,
      ``,
      `### Funders represented`,
      ...[...funderCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => `- ${name}: ${n}`),
      ``,
      ...(issues.length > 0
        ? [`### Issues`, ...issues, ``]
        : [`_No structural issues detected._`, ``]),
    );

    return {
      ok: true as const,
      generatedAt: new Date().toISOString(),
      count: rows.length,
      markdown: parts.join("\n"),
      index,
      quality: {
        withAmount,
        withDeadline,
        withSectors,
        invalidUrls,
        missingFunder,
        funders: Object.fromEntries(funderCounts),
        incompleteRemaining: rows.filter(isIncomplete).map((r) => r.id),
      },
      enrichment: enrichmentReport,
    };
  });

// Curator action: mark a list of grant IDs as shortlisted, with optional note.
// Records who curated it and the note inside grant_events for full audit.
// Enforces forward-only state transitions: discovered → enriched → scored →
// shortlisted → in_proposal → submitted → won/lost/expired/archived.
// Generic status move for board interactions (drag-to-move, bulk actions).
// Validates against the shared state machine BEFORE hitting the DB so the UI
// gets a clean per-grant verdict; the DB trigger remains the final enforcer.
export const moveGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        grantIds: z.array(z.string().uuid()).min(1).max(50),
        toStatus: z.enum(GRANT_STATUSES),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ts = new Date().toISOString();
    let updated = 0;
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of data.grantIds) {
      const { data: prev } = await context.supabase
        .from("grants")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      const fromStatus = (prev as { status?: string } | null)?.status;
      if (!fromStatus || !isGrantStatus(fromStatus)) {
        skipped.push({ id, reason: "not_found" });
        continue;
      }
      if (fromStatus === data.toStatus) {
        skipped.push({ id, reason: "already_there" });
        continue;
      }
      if (!canTransition(fromStatus, data.toStatus)) {
        skipped.push({ id, reason: `invalid_transition:${fromStatus}->${data.toStatus}` });
        continue;
      }
      const { error: uerr } = await context.supabase
        .from("grants")
        .update({ status: data.toStatus, updated_at: ts } as never)
        .eq("id", id);
      if (uerr) {
        skipped.push({ id, reason: uerr.message.slice(0, 200) });
        continue;
      }
      updated++;
      // No explicit grant_events insert here: the AFTER UPDATE trigger
      // grants_log_transition already records the transition; a second
      // app-side insert would duplicate the (now immutable) audit timeline.
    }
    return { ok: true, updated, skipped };
  });

export const markGrantsCurated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        grantIds: z.array(z.string().uuid()).min(1).max(50),
        note: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ts = new Date().toISOString();
    let updated = 0;
    let skipped = 0;
    for (const id of data.grantIds) {
      const { data: prev } = await context.supabase
        .from("grants")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      const fromStatus = (prev as { status?: string } | null)?.status ?? null;
      // Reuse the single source of truth (pipeline-stages.shared.ts, which
      // mirrors the DB trigger) instead of a second hand-rolled status-order
      // list. The old duplicate allowed "discovered"/"enriched" -> "shortlisted"
      // directly, a transition the DB trigger actually rejects at the UPDATE —
      // this function would then quietly count the resulting DB error as a
      // generic "skipped" instead of a clean pre-check.
      if (!fromStatus || !isGrantStatus(fromStatus) || !canTransition(fromStatus, "shortlisted")) {
        skipped++;
        continue;
      }
      const { error: uerr } = await context.supabase
        .from("grants")
        .update({ status: "shortlisted", updated_at: ts } as never)
        .eq("id", id);
      if (uerr) {
        skipped++;
        continue;
      }
      updated++;
      // The grants_log_transition trigger records this transition with
      // actor_user_id = auth.uid() (migration 20260703080000); an app-side
      // insert here would duplicate the immutable audit timeline.
    }
    return { ok: true, updated, skipped };
  });

// Pipeline analytics (win-rate, funnel conversions, time-in-stage) — Instrumentl-
// style, derived from grant_events. Admin-only; computation is a pure function.
export const getPipelineAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computePipelineAnalytics } = await import("@/lib/pipeline-analytics");
    const [{ data: grants, error: ge }, { data: events, error: ee }] = await Promise.all([
      supabaseAdmin.from("grants").select("id, status"),
      supabaseAdmin
        .from("grant_events")
        .select("grant_id, from_status, to_status, created_at")
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);
    if (ge) throw new Error(ge.message);
    if (ee) throw new Error(ee.message);
    return computePipelineAnalytics({
      grants: (grants ?? []) as Array<{ id: string; status: string }>,
      events: (events ?? []) as Parameters<typeof computePipelineAnalytics>[0]["events"],
    });
  });
