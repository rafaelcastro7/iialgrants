// Source Curator orchestrator (tiered). Runs every ingester for a given tier,
// dedupes, scores, and routes new orgs into funder_candidates / funders.
//
// Tier A — daily   : low-cost RSS + JSON polls (rss_grants).
// Tier B — weekly  : structured scrapes / JSON APIs (bbf, eu_ft, tri_council).
// Tier C — monthly : large dumps (tbs_gc, pfc_members, t3010, otf, alberta).
// Scout            : web-wide LLM funder scout (weekly, runs with Tier B).
//
// All ingestors return RawCandidate[]; the curator handles dedup + scoring +
// auto-promote + telemetry into source_ingest_runs and updates the registry.

import { newRunId } from "@/lib/otel";
import {
  AUTO_APPROVE_THRESHOLD,
  REVIEW_MIN_THRESHOLD,
  findDuplicate,
  scoreCandidate,
  type RawCandidate,
} from "./scoring.server";

export type Tier = "A" | "B" | "C" | "scout" | "all";

export type CuratorResult = {
  runId: string;
  tier: Tier;
  durationMs: number;
  perSource: Record<
    string,
    { rows: number; new: number; dup: number; rejected: number; auto: number; err: number }
  >;
  totals: { rows: number; new: number; dup: number; rejected: number; auto: number; err: number };
};

type SourceFn = () => Promise<RawCandidate[]>;

async function runSource(name: string, fn: SourceFn, result: CuratorResult): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t0 = Date.now();
  const bucket = { rows: 0, new: 0, dup: 0, rejected: 0, auto: 0, err: 0 };
  result.perSource[name] = bucket;
  let raw: RawCandidate[] = [];
  let status: "succeeded" | "failed" = "succeeded";
  let errorMessage: string | null = null;
  try {
    raw = await fn();
  } catch (e) {
    bucket.err++;
    status = "failed";
    errorMessage = e instanceof Error ? e.message : String(e);
  }
  bucket.rows = raw.length;

  if (status === "succeeded") {
    for (const c of raw) {
      try {
        const dupe = await findDuplicate(c);
        if (dupe.kind !== "new") {
          bucket.dup++;
          continue;
        }
        const score = scoreCandidate(c);
        if (score < REVIEW_MIN_THRESHOLD) {
          // Not a duplicate — a genuinely new candidate whose signal quality
          // (BN/website/multiple sources/etc.) is too thin to review yet.
          // Counting this as `dup` corrupted the source_health_summary
          // duplicate-rate telemetry (a real dedup hit and "we don't know
          // enough about this org" look identical downstream). Track it
          // separately instead.
          bucket.rejected++;
          continue;
        }
        const cStatus = score >= AUTO_APPROVE_THRESHOLD ? "approved" : "pending_review";
        const { data: inserted, error } = await supabaseAdmin
          .from("funder_candidates")
          .insert({
            name: c.name,
            name_fr: c.name_fr ?? null,
            bn_number: c.bn_number ?? null,
            province: c.province ?? null,
            funder_type: c.funder_type ?? null,
            website: c.website ?? null,
            source_signals: c.source_signals,
            score,
            status: cStatus,
            raw_metadata: (c.raw_metadata ?? {}) as never,
          })
          .select("id")
          .single();
        if (error) {
          bucket.err++;
          continue;
        }
        bucket.new++;
        if (cStatus === "approved" && inserted) {
          const { error: fErr } = await supabaseAdmin.from("funders").insert({
            name: c.name,
            name_fr: c.name_fr ?? null,
            country: "CA",
            jurisdiction: c.province ?? null,
            website: c.website ?? null,
            source_url: c.website ?? null,
            source_type: "manual",
            bn_number: c.bn_number ?? null,
            disbursed_annual: c.disbursed_annual ?? null,
            active: true,
          });
          if (!fErr) bucket.auto++;
        }
      } catch {
        bucket.err++;
      }
    }
  }

  await supabaseAdmin.from("source_ingest_runs").insert({
    dataset: name,
    rows_in: bucket.rows,
    candidates_out: bucket.new,
    auto_approved: bucket.auto,
    duplicates: bucket.dup,
    errors: bucket.err,
    latency_ms: Date.now() - t0,
    status,
    error_message: errorMessage,
    // `rejected_low_score` has no dedicated column (would need a migration);
    // kept honest in metadata rather than folded into `duplicates`.
    metadata: { run_id: result.runId, tier: result.tier, rejected_low_score: bucket.rejected },
  });

  // Update registry health snapshot.
  await supabaseAdmin
    .from("discovery_sources_registry")
    .update({
      last_run_at: new Date().toISOString(),
      last_status: status,
      last_error: errorMessage,
    })
    .eq("dataset_key", name);
}

// Per-tier ingestor map. Lazy-imported so cold paths stay cheap.
async function ingestorsForTier(tier: Tier): Promise<Array<{ key: string; fn: SourceFn }>> {
  const out: Array<{ key: string; fn: SourceFn }> = [];

  if (tier === "A" || tier === "all") {
    const { fetchRssGrantCandidates } = await import("./rss-grants.server");
    out.push({ key: "rss_grants_bundle", fn: fetchRssGrantCandidates });
  }

  if (tier === "B" || tier === "all") {
    const { fetchBbfPrograms } = await import("./bbf-programs.server");
    const { fetchEuCalls } = await import("./eu-ft.server");
    const { fetchTriCouncilFunders } = await import("./tri-council.server");
    out.push({ key: "bbf_programs", fn: fetchBbfPrograms });
    out.push({ key: "eu_ft_portal", fn: fetchEuCalls });
    out.push({ key: "tri_council", fn: fetchTriCouncilFunders });
  }

  if (tier === "scout" || tier === "all") {
    const { runFunderScout } = await import("./funder-scout.server");
    out.push({ key: "funder_scout", fn: runFunderScout });
  }

  if (tier === "C" || tier === "all") {
    const { fetchRecentGcRows, extractGcCandidates } = await import("./gc-proactive.server");
    const { scrapePfcMembers } = await import("./pfc-scrape.server");
    const { fetchT3010Foundations, extractT3010Candidates } = await import("./t3010.server");
    const { fetchOtfRecipients } = await import("./otf.server");
    const { fetchAlbertaGrants } = await import("./alberta-ckan.server");
    out.push({
      key: "tbs_gc",
      fn: async () => extractGcCandidates(await fetchRecentGcRows(35, 5000)),
    });
    out.push({ key: "pfc_members", fn: scrapePfcMembers });
    out.push({
      key: "t3010_charities",
      fn: async () => extractT3010Candidates(await fetchT3010Foundations(500)),
    });
    out.push({ key: "otf_open", fn: fetchOtfRecipients });
    out.push({ key: "alberta_ckan", fn: fetchAlbertaGrants });
  }

  // Respect registry enabled flag.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("discovery_sources_registry")
      .select("dataset_key, enabled");
    const enabled = new Map(
      (data ?? []).map((r: { dataset_key: string; enabled: boolean }) => [
        r.dataset_key,
        r.enabled,
      ]),
    );
    return out.filter((i) => enabled.get(i.key) !== false);
  } catch {
    return out;
  }
}

export async function runSourceCurator(tier: Tier = "all"): Promise<CuratorResult> {
  const result: CuratorResult = {
    runId: newRunId(),
    tier,
    durationMs: 0,
    perSource: {},
    totals: { rows: 0, new: 0, dup: 0, rejected: 0, auto: 0, err: 0 },
  };
  const t0 = Date.now();
  const ingestors = await ingestorsForTier(tier);
  for (const ing of ingestors) {
    await runSource(ing.key, ing.fn, result);
  }
  for (const b of Object.values(result.perSource)) {
    result.totals.rows += b.rows;
    result.totals.new += b.new;
    result.totals.dup += b.dup;
    result.totals.rejected += b.rejected;
    result.totals.auto += b.auto;
    result.totals.err += b.err;
  }
  result.durationMs = Date.now() - t0;
  return result;
}
