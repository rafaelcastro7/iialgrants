// Orchestrator for discoverAllFunders — fire-and-forget background job with
// timeouts, retries with exponential backoff, and per-attempt logging into
// agent_runs (tagged with metadata.job_id so the UI can aggregate by job).

import { discoverFunderImpl } from "@/agents/discoverer.impl.server";

const FUNDER_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = [0, 1500]; // pre-attempt wait per attempt index
const FUNDER_CONCURRENCY = 4; // run up to N funders in parallel

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function logRetry(opts: {
  jobId: string;
  funderId: string;
  funderName: string;
  attempt: number;
  error: string;
  willRetry: boolean;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("agent_runs").insert({
      run_id: crypto.randomUUID(),
      agent: "discoverer",
      status: opts.willRetry ? "degraded" : "failed",
      model: "phi4-mini:latest",
      error: opts.error,
      metadata: {
        job_id: opts.jobId,
        funder_id: opts.funderId,
        funder_name: opts.funderName,
        attempt: opts.attempt,
        stage: "orchestrator_retry",
        will_retry: opts.willRetry,
      },
    });
  } catch {
    /* logging is best-effort */
  }
}

export type DiscoveryJobResult = {
  totalInserted: number;
  totalSeenAgain: number;
  totalProcessed: number;
  evaluated: number;
  perFunder: Array<{
    funder: string;
    inserted: number;
    seenAgain?: number;
    engine?: string;
    error?: string;
  }>;
};

export async function runDiscoveryJob(
  jobId: string,
  triggeringUserId: string,
  funderIds?: string[],
): Promise<DiscoveryJobResult> {
  const { assertModuleEnabled } = await import("@/lib/admin-modules.functions");
  await assertModuleEnabled("grants_discovery");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Job started marker (status='running' so UI knows it's in flight).
  await supabaseAdmin.from("agent_runs").insert({
    run_id: jobId,
    agent: "discoverer",
    status: "running",
    model: "phi4-mini:latest",
    metadata: {
      job_id: jobId,
      stage: "orchestrator_started",
      user_id: triggeringUserId,
      funder_ids: funderIds ?? null,
    },
  });

  let q = supabaseAdmin
    .from("funders")
    .select("id, name")
    .eq("active", true)
    .not("source_url", "is", null);
  if (funderIds && funderIds.length > 0) q = q.in("id", funderIds);
  const { data: funders, error } = await q;
  if (error) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: crypto.randomUUID(),
      agent: "discoverer",
      status: "failed",
      model: "phi4-mini:latest",
      error: error.message,
      metadata: { job_id: jobId, stage: "orchestrator_funders_query" },
    });
    return { totalInserted: 0, totalSeenAgain: 0, totalProcessed: 0, evaluated: 0, perFunder: [] };
  }

  let totalInserted = 0;
  let totalSeenAgain = 0;
  let totalProcessed = 0;
  const perFunder: DiscoveryJobResult["perFunder"] = [];

  async function runOne(f: { id: string; name: string }) {
    let success = false;
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 5000));
      try {
        const r = await withTimeout(
          discoverFunderImpl(f.id, { jobId, attempt, funderName: f.name }),
          FUNDER_TIMEOUT_MS,
          "funder_run",
        );
        totalInserted += r.inserted;
        totalSeenAgain += r.seenAgain ?? 0;
        totalProcessed += 1;
        perFunder.push({
          funder: f.name,
          inserted: r.inserted,
          seenAgain: r.seenAgain,
          engine: r.engine,
        });
        success = true;
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        const willRetry = attempt < MAX_ATTEMPTS;
        await logRetry({
          jobId,
          funderId: f.id,
          funderName: f.name,
          attempt,
          error: msg,
          willRetry,
        });
        if (!willRetry) totalProcessed += 1;
      }
    }
    if (!success) perFunder.push({ funder: f.name, inserted: 0, error: lastError });
  }

  // Parallelize across funders so a single slow site can't starve the budget.
  const list = funders ?? [];
  for (let i = 0; i < list.length; i += FUNDER_CONCURRENCY) {
    const batch = list.slice(i, i + FUNDER_CONCURRENCY);
    await Promise.allSettled(batch.map(runOne));
  }

  // Auto-evaluate fit for the triggering user (best effort). Grants this same
  // job just discovered are still "discovered" (no enrichment step runs in
  // this job) and evaluateGrantImpl unconditionally rejects that status —
  // this instead clears any of the user's backlog that's already enriched
  // but never got scored, so a discovery run also nudges that queue forward.
  let evaluated = 0;
  const evalErrors: Array<{ grantId: string; error: string }> = [];
  try {
    const { data: org } = await supabaseAdmin
      .from("org_profiles")
      .select("user_id")
      .eq("user_id", triggeringUserId)
      .maybeSingle();
    if (org) {
      const { evaluateGrantImpl } = await import("@/agents/evaluator.impl.server");
      const { data: pending } = await supabaseAdmin
        .from("grants")
        .select("id")
        .eq("status", "enriched")
        .limit(15);
      // Build a user-scoped client (RLS as the triggering user).
      const { createClient } = await import("@supabase/supabase-js");
      const userSupabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      for (const g of pending ?? []) {
        try {
          await evaluateGrantImpl({ grantId: g.id, userId: triggeringUserId, userSupabase });
          evaluated++;
        } catch (e) {
          evalErrors.push({ grantId: g.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  } catch (e) {
    evalErrors.push({ grantId: "(setup)", error: e instanceof Error ? e.message : String(e) });
  }

  // Job completed marker — final aggregate metrics.
  await supabaseAdmin.from("agent_runs").insert({
    run_id: jobId,
    agent: "discoverer",
    status: "succeeded",
    model: "phi4-mini:latest",
    metadata: {
      job_id: jobId,
      stage: "orchestrator_completed",
      totalInserted,
      totalSeenAgain,
      totalProcessed,
      evaluated,
      eval_errors: evalErrors.slice(0, 5),
      funders_queued: funders?.length ?? 0,
    },
  });

  return { totalInserted, totalSeenAgain, totalProcessed, evaluated, perFunder };
}
