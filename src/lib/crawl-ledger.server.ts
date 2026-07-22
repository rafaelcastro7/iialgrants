// Per-URL crawl scheduling (Nutch/Scrapy-style adaptive revisit).
//
// Public surface:
//   - shouldFetch(url)               → { fetch: boolean; reason: string; etag?, lastModified? }
//   - recordFetch(url, result)       → updates ledger, computes next_fetch_at
//   - ledgerStats(funderId?)         → counts of due / queued / stable / gone
//
// Cadence rules (hours):
//   • First fetch                  : 24
//   • Unchanged                    : clamp(prev × 1.5, 24, 336 [14d])
//   • Changed                      : clamp(prev × 0.5, 6, 336)
//   • HTTP 304 (cheap recheck)     : same as unchanged
//   • HTTP 404/410                 : 720 (30d), status = 'gone'
//   • Blocked by robots.txt        : 168 (7d), status = 'blocked'
//   • Transient error (5xx/timeout): min(prev × 2, 168) capped, status = 'error'

import { createHash } from "crypto";

export type LedgerSkip = { fetch: false; reason: string; etag?: string; lastModified?: string };
export type LedgerGo = {
  fetch: true;
  reason: string;
  etag?: string;
  lastModified?: string;
  intervalHours: number;
};
export type LedgerDecision = LedgerSkip | LedgerGo;

export type FetchOutcome =
  | {
      kind: "ok";
      markdown: string;
      title?: string;
      via: string;
      httpStatus?: number;
      etag?: string;
      lastModified?: string;
      bytes?: number;
    }
  | { kind: "not_modified"; httpStatus: 304; via: string; etag?: string; lastModified?: string }
  | { kind: "gone"; httpStatus: 404 | 410 }
  | { kind: "blocked"; reason: string }
  | { kind: "error"; reason: string; httpStatus?: number };

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export async function shouldFetch(url: string): Promise<LedgerDecision> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // crawl_ledger isn't in the generated types yet — cast through any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const { data } = await sb
    .from("crawl_ledger")
    .select("next_fetch_at, etag, last_modified, status, interval_hours")
    .eq("url", url)
    .maybeSingle();
  if (!data) return { fetch: true, reason: "new", intervalHours: 24 };
  const row = data as {
    next_fetch_at: string;
    etag: string | null;
    last_modified: string | null;
    status: string;
    interval_hours: number;
  };
  const due = new Date(row.next_fetch_at).getTime() <= Date.now();
  // gone/blocked pages are skipped only until their sanity-recheck window
  // (recordFetch schedules 30d / 7d respectively) elapses — a transient 404
  // or a temporary robots.txt block must not kill the URL forever.
  if (row.status === "gone" && !due) return { fetch: false, reason: "gone" };
  if (row.status === "blocked" && !due) return { fetch: false, reason: "blocked" };
  if (!due)
    return {
      fetch: false,
      reason: "not_due_yet",
      etag: row.etag ?? undefined,
      lastModified: row.last_modified ?? undefined,
    };
  return {
    fetch: true,
    reason: "due",
    etag: row.etag ?? undefined,
    lastModified: row.last_modified ?? undefined,
    intervalHours: row.interval_hours,
  };
}

export async function recordFetch(
  url: string,
  outcome: FetchOutcome,
  opts: { funderId?: string | null; previousIntervalHours?: number | null } = {},
): Promise<{
  next_fetch_at: string;
  status: string;
  changed: boolean;
  interval_hours: number;
  content_hash: string | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();

  let contentHash: string | null = null;
  let via: string | null = null;
  let httpStatus: number | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;
  let bytes: number | null = null;
  let title: string | null = null;
  let errorReason: string | null = null;

  switch (outcome.kind) {
    case "ok":
      via = outcome.via;
      httpStatus = outcome.httpStatus ?? 200;
      etag = outcome.etag ?? null;
      lastModified = outcome.lastModified ?? null;
      bytes = outcome.bytes ?? outcome.markdown.length;
      title = outcome.title ?? null;
      contentHash = sha256(outcome.markdown);
      break;
    case "not_modified":
      via = outcome.via;
      etag = outcome.etag ?? null;
      lastModified = outcome.lastModified ?? null;
      break;
    case "gone":
      httpStatus = outcome.httpStatus;
      break;
    case "blocked":
      errorReason = outcome.reason;
      break;
    case "error":
      httpStatus = outcome.httpStatus ?? null;
      errorReason = outcome.reason;
      break;
  }

  // The read-modify-write (previous hash/interval → next cadence → upsert)
  // happens atomically in the record_crawl_fetch() SQL function, guarded by
  // an advisory lock keyed on the URL — closes the lost-update race that
  // existed when two overlapping discovery runs hit the same URL.
  const { data, error } = await sb
    .rpc("record_crawl_fetch", {
      p_url: url,
      p_host: host,
      p_funder_id: opts.funderId ?? null,
      p_outcome_kind: outcome.kind,
      p_content_hash: contentHash,
      p_via: via,
      p_http_status: httpStatus,
      p_etag: etag,
      p_last_modified: lastModified,
      p_bytes: bytes,
      p_title: title,
      p_error_reason: errorReason,
      p_default_interval: opts.previousIntervalHours ?? 24,
    })
    .single();
  if (error) throw new Error(`ledger_record_fetch_failed: ${error.message}`);

  return data as {
    next_fetch_at: string;
    status: string;
    changed: boolean;
    interval_hours: number;
    content_hash: string | null;
  };
}

// Dead-source detection: a discovery source (funder) whose last N succeeded
// discoverer runs all yielded 0 grants is flagged "possibly dead". Derived
// from agent_runs metadata (funder_id / found) — no extra table/column needed.
export const DEAD_SOURCE_THRESHOLD = 3;

export type DeadSource = {
  funder_id: string;
  funder_name: string | null;
  consecutive_empty_runs: number;
  last_run_at: string;
};

export async function listDeadSources(
  threshold: number = DEAD_SOURCE_THRESHOLD,
): Promise<DeadSource[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const { data, error } = await sb
    .from("agent_runs")
    .select("created_at, metadata")
    .eq("agent", "discoverer")
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  type Run = { created_at: string; metadata: Record<string, unknown> | null };
  // Runs arrive newest-first; count leading zero-yield runs per funder until
  // the first non-empty run breaks the streak.
  const streaks = new Map<
    string,
    { name: string | null; empty: number; broken: boolean; total: number; lastRunAt: string }
  >();
  for (const r of (data ?? []) as Run[]) {
    const meta = r.metadata ?? {};
    const funderId = typeof meta.funder_id === "string" ? meta.funder_id : null;
    if (!funderId) continue;
    const found = typeof meta.found === "number" ? meta.found : null;
    if (found === null) continue;
    let s = streaks.get(funderId);
    if (!s) {
      s = {
        name: typeof meta.funder_name === "string" ? meta.funder_name : null,
        empty: 0,
        broken: false,
        total: 0,
        lastRunAt: r.created_at,
      };
      streaks.set(funderId, s);
    }
    s.total += 1;
    if (!s.broken) {
      if (found === 0) s.empty += 1;
      else s.broken = true;
    }
  }

  const dead: DeadSource[] = [];
  for (const [funderId, s] of streaks) {
    if (s.empty >= threshold) {
      dead.push({
        funder_id: funderId,
        funder_name: s.name,
        consecutive_empty_runs: s.empty,
        last_run_at: s.lastRunAt,
      });
    }
  }
  dead.sort((a, b) => b.consecutive_empty_runs - a.consecutive_empty_runs);
  return dead;
}

export async function ledgerStats(funderId?: string): Promise<{
  due_now: number;
  queued_24h: number;
  stable: number;
  gone: number;
  blocked: number;
  errored: number;
  total: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  let q = sb.from("crawl_ledger").select("status, next_fetch_at", { count: "exact" });
  if (funderId) q = q.eq("funder_id", funderId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const now = Date.now();
  const in24h = now + 24 * 3600_000;
  const stats = { due_now: 0, queued_24h: 0, stable: 0, gone: 0, blocked: 0, errored: 0, total: 0 };
  for (const r of (data ?? []) as Array<{ status: string; next_fetch_at: string }>) {
    stats.total += 1;
    if (r.status === "gone") stats.gone++;
    else if (r.status === "blocked") stats.blocked++;
    else if (r.status === "error") stats.errored++;
    else {
      const t = new Date(r.next_fetch_at).getTime();
      if (t <= now) stats.due_now++;
      else if (t <= in24h) stats.queued_24h++;
      else stats.stable++;
    }
  }
  return stats;
}
