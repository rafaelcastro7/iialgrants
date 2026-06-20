// Source Curator orchestrator: runs every ingester, dedups, scores, routes.
// Server-only. Called by the monthly pg_cron webhook + by admin "Run now".

import { newRunId } from "@/lib/otel";
import {
  AUTO_APPROVE_THRESHOLD,
  REVIEW_MIN_THRESHOLD,
  findDuplicate,
  scoreCandidate,
  type RawCandidate,
} from "./scoring";

export type CuratorResult = {
  runId: string;
  durationMs: number;
  perSource: Record<string, { rows: number; new: number; dup: number; auto: number; err: number }>;
  totals: { rows: number; new: number; dup: number; auto: number; err: number };
};

type SourceFn = () => Promise<RawCandidate[]>;

async function runSource(name: string, fn: SourceFn, result: CuratorResult): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t0 = Date.now();
  const bucket = { rows: 0, new: 0, dup: 0, auto: 0, err: 0 };
  result.perSource[name] = bucket;
  let raw: RawCandidate[] = [];
  try {
    raw = await fn();
  } catch (e) {
    bucket.err++;
    await supabaseAdmin.from("source_ingest_runs").insert({
      dataset: name, rows_in: 0, candidates_out: 0, errors: 1,
      latency_ms: Date.now() - t0, status: "failed",
      error_message: e instanceof Error ? e.message : String(e),
      metadata: { run_id: result.runId },
    });
    return;
  }
  bucket.rows = raw.length;

  for (const c of raw) {
    try {
      const dupe = await findDuplicate(c);
      if (dupe.kind !== "new") { bucket.dup++; continue; }
      const score = scoreCandidate(c);
      if (score < REVIEW_MIN_THRESHOLD) { bucket.dup++; continue; } // silently drop
      const status = score >= AUTO_APPROVE_THRESHOLD ? "approved" : "pending_review";
      const { data: inserted, error } = await supabaseAdmin.from("funder_candidates").insert({
        name: c.name, name_fr: c.name_fr ?? null,
        bn_number: c.bn_number ?? null, province: c.province ?? null,
        funder_type: c.funder_type ?? null, website: c.website ?? null,
        source_signals: c.source_signals, score, status,
        raw_metadata: (c.raw_metadata ?? {}) as never,
      }).select("id").single();
      if (error) { bucket.err++; continue; }
      bucket.new++;
      if (status === "approved" && inserted) {
        // Auto-seed into funders table.
        const { error: fErr } = await supabaseAdmin.from("funders").insert({
          name: c.name, name_fr: c.name_fr ?? null,
          country: "CA", jurisdiction: c.province ?? null,
          website: c.website ?? null, source_url: c.website ?? null,
          source_type: "manual", bn_number: c.bn_number ?? null,
          disbursed_annual: c.disbursed_annual ?? null, active: true,
        });
        if (!fErr) bucket.auto++;
      }
    } catch { bucket.err++; }
  }

  await supabaseAdmin.from("source_ingest_runs").insert({
    dataset: name, rows_in: bucket.rows, candidates_out: bucket.new,
    auto_approved: bucket.auto, duplicates: bucket.dup, errors: bucket.err,
    latency_ms: Date.now() - t0, status: "succeeded",
    metadata: { run_id: result.runId },
  });
}

export async function runSourceCurator(): Promise<CuratorResult> {
  const result: CuratorResult = {
    runId: newRunId(), durationMs: 0, perSource: {},
    totals: { rows: 0, new: 0, dup: 0, auto: 0, err: 0 },
  };
  const t0 = Date.now();

  const { fetchRecentGcRows, extractGcCandidates } = await import("./gc-proactive.server");
  const { scrapePfcMembers } = await import("./pfc-scrape.server");

  await runSource("tbs_gc", async () => {
    const rows = await fetchRecentGcRows(35, 5000);
    return extractGcCandidates(rows);
  }, result);

  await runSource("pfc_members", scrapePfcMembers, result);

  // Aggregate totals
  for (const b of Object.values(result.perSource)) {
    result.totals.rows += b.rows; result.totals.new += b.new;
    result.totals.dup += b.dup; result.totals.auto += b.auto;
    result.totals.err += b.err;
  }
  result.durationMs = Date.now() - t0;
  return result;
}
