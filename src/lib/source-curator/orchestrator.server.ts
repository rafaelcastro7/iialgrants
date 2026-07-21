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
    {
      rows: number;
      new: number;
      dup: number;
      held: number;
      rejected: number;
      auto: number;
      err: number;
    }
  >;
  totals: {
    rows: number;
    new: number;
    dup: number;
    held: number;
    rejected: number;
    auto: number;
    err: number;
  };
};

type SourceFn = () => Promise<RawCandidate[]>;

export function mergeCandidateEvidence(
  existing: RawCandidate,
  incoming: RawCandidate,
): RawCandidate {
  return {
    name: existing.name || incoming.name,
    name_fr: existing.name_fr || incoming.name_fr || null,
    bn_number: existing.bn_number || incoming.bn_number || null,
    province: existing.province || incoming.province || null,
    funder_type: existing.funder_type || incoming.funder_type || null,
    website: existing.website || incoming.website || null,
    disbursed_annual:
      Math.max(existing.disbursed_annual ?? 0, incoming.disbursed_annual ?? 0) || null,
    source_signals: [...new Set([...existing.source_signals, ...incoming.source_signals])],
    raw_metadata: {
      ...(existing.raw_metadata ?? {}),
      ...(incoming.raw_metadata ?? {}),
    },
  };
}

async function runSource(name: string, fn: SourceFn, result: CuratorResult): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t0 = Date.now();
  const bucket = { rows: 0, new: 0, dup: 0, held: 0, rejected: 0, auto: 0, err: 0 };
  result.perSource[name] = bucket;
  let raw: RawCandidate[] = [];
  let status: "succeeded" | "failed" | "degraded" = "succeeded";
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
        if (dupe.kind === "existing_funder") {
          bucket.dup++;
          continue;
        }
        if (dupe.kind === "existing_candidate") {
          const { data: existing, error: existingError } = await supabaseAdmin
            .from("funder_candidates")
            .select(
              "name,name_fr,bn_number,province,funder_type,website,disbursed_annual,source_signals,score,status,raw_metadata",
            )
            .eq("id", dupe.candidateId)
            .single();
          if (existingError || !existing) {
            throw new Error(existingError?.message ?? "candidate_missing");
          }
          if (existing.status === "approved" || existing.status === "rejected") {
            bucket.dup++;
            continue;
          }
          const merged = mergeCandidateEvidence(existing as RawCandidate, c);
          const mergedScore = scoreCandidate(merged);
          const mergedStatus = mergedScore >= REVIEW_MIN_THRESHOLD ? "pending_review" : "candidate";
          const { error: mergeError } = await supabaseAdmin
            .from("funder_candidates")
            .update({
              name_fr: merged.name_fr ?? null,
              bn_number: merged.bn_number ?? null,
              province: merged.province ?? null,
              funder_type: merged.funder_type ?? null,
              website: merged.website ?? null,
              disbursed_annual: merged.disbursed_annual ?? null,
              source_signals: merged.source_signals,
              score: mergedScore,
              status: mergedStatus,
              raw_metadata: (merged.raw_metadata ?? {}) as never,
            })
            .eq("id", dupe.candidateId);
          if (mergeError) throw new Error(mergeError.message);
          bucket.dup++;
          if (mergedStatus === "candidate") bucket.held++;
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
          const { error: heldError } = await supabaseAdmin.from("funder_candidates").insert({
            name: c.name,
            name_fr: c.name_fr ?? null,
            bn_number: c.bn_number ?? null,
            province: c.province ?? null,
            funder_type: c.funder_type ?? null,
            website: c.website ?? null,
            disbursed_annual: c.disbursed_annual ?? null,
            source_signals: c.source_signals,
            score,
            status: "candidate",
            raw_metadata: (c.raw_metadata ?? {}) as never,
          });
          if (heldError) throw new Error(heldError.message);
          bucket.new++;
          bucket.held++;
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
            disbursed_annual: c.disbursed_annual ?? null,
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
      } catch (error) {
        bucket.err++;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
    if (bucket.err > 0) {
      status = "degraded";
      errorMessage = `candidate_processing_errors:${bucket.err}:${errorMessage ?? "unknown"}`;
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
    // Low-signal candidates are persisted for future corroboration and kept
    // separate from genuine rejections and deduplication telemetry.
    metadata: {
      run_id: result.runId,
      tier: result.tier,
      held_low_signal: bucket.held,
      rejected_low_score: bucket.rejected,
    },
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

  // Respect registry enabled flags. A failed registry read must not run sources
  // an administrator intentionally disabled.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("discovery_sources_registry")
    .select("dataset_key, enabled");
  if (error) throw new Error(`source_registry_read_failed:${error.message}`);
  const enabled = new Map(
    (data ?? []).map((row: { dataset_key: string; enabled: boolean }) => [
      row.dataset_key,
      row.enabled,
    ]),
  );
  return out.filter((ingester) => enabled.get(ingester.key) !== false);
}

export async function runSourceCurator(tier: Tier = "all"): Promise<CuratorResult> {
  const result: CuratorResult = {
    runId: newRunId(),
    tier,
    durationMs: 0,
    perSource: {},
    totals: { rows: 0, new: 0, dup: 0, held: 0, rejected: 0, auto: 0, err: 0 },
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
    result.totals.held += b.held;
    result.totals.rejected += b.rejected;
    result.totals.auto += b.auto;
    result.totals.err += b.err;
  }
  result.durationMs = Date.now() - t0;
  return result;
}
