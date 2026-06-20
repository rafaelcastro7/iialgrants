// Orchestrator for discoverAllFunders — fire-and-forget background job with
// timeouts, retries with exponential backoff, and per-attempt logging into
// agent_runs (tagged with metadata.job_id so the UI can aggregate by job).

import { discoverFunderImpl } from "@/agents/discoverer.impl.server";

const FUNDER_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 1500, 4000]; // pre-attempt wait per attempt index

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
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
      model: "google/gemini-2.5-flash",
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
  } catch { /* logging is best-effort */ }
}

export async function runDiscoveryJob(
  jobId: string,
  triggeringUserId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Job started marker (status='running' so UI knows it's in flight).
  await supabaseAdmin.from("agent_runs").insert({
    run_id: jobId,
    agent: "discoverer",
    status: "running",
    model: "google/gemini-2.5-flash",
    metadata: { job_id: jobId, stage: "orchestrator_started", user_id: triggeringUserId },
  });

  const { data: funders, error } = await supabaseAdmin
    .from("funders")
    .select("id, name")
    .eq("active", true)
    .not("source_url", "is", null);
  if (error) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: crypto.randomUUID(), agent: "discoverer", status: "failed",
      model: "google/gemini-2.5-flash", error: error.message,
      metadata: { job_id: jobId, stage: "orchestrator_funders_query" },
    });
    return;
  }

  let totalInserted = 0;
  let totalSeenAgain = 0;
  let totalProcessed = 0;

  for (const f of funders ?? []) {
    let success = false;
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
        success = true;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const willRetry = attempt < MAX_ATTEMPTS;
        await logRetry({ jobId, funderId: f.id, funderName: f.name, attempt, error: msg, willRetry });
        if (!willRetry) totalProcessed += 1;
      }
    }
    if (!success) { /* already logged failed */ }
  }

  // Auto-evaluate fit for the triggering user (best effort).
  let evaluated = 0;
  try {
    const { data: org } = await supabaseAdmin
      .from("org_profiles").select("user_id").eq("user_id", triggeringUserId).maybeSingle();
    if (org) {
      const { evaluateGrantImpl } = await import("@/agents/evaluator.impl.server");
      const { data: pending } = await supabaseAdmin
        .from("grants").select("id").eq("status", "discovered").limit(15);
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
        } catch { /* keep going */ }
      }
    }
  } catch { /* evaluator disabled */ }

  // Job completed marker — final aggregate metrics.
  await supabaseAdmin.from("agent_runs").insert({
    run_id: jobId,
    agent: "discoverer",
    status: "succeeded",
    model: "google/gemini-2.5-flash",
    metadata: {
      job_id: jobId,
      stage: "orchestrator_completed",
      totalInserted,
      totalSeenAgain,
      totalProcessed,
      evaluated,
      funders_queued: funders?.length ?? 0,
    },
  });
}
