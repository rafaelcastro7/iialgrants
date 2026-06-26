// Per-URL crawl scheduling (Nutch/Scrapy-style adaptive revisit).
//
// Public surface:
//   - shouldFetch(url)               → { fetch: boolean; reason: string; etag?, lastModified? }
//   - recordFetch(url, result)       → updates ledger, computes next_fetch_at
//   - ledgerStats(funderId?)         → counts of due / queued / stable / gone
//
// Cadence rules (hours):
//   • First fetch                  : 24
//   • Unchanged                    : min(prev × 1.5, 336 [14d])
//   • Changed                      : max(prev × 0.5, 6)
//   • HTTP 304 (cheap recheck)     : same as unchanged
//   • HTTP 404/410                 : 720 (30d), status = 'gone'
//   • Blocked by robots.txt        : 168 (7d), status = 'blocked'
//   • Transient error (5xx/timeout): min(prev × 2, 168) capped, status = 'error'

import { createHash } from "crypto";

export type LedgerSkip = { fetch: false; reason: string; etag?: string; lastModified?: string };
export type LedgerGo   = { fetch: true;  reason: string; etag?: string; lastModified?: string; intervalHours: number };
export type LedgerDecision = LedgerSkip | LedgerGo;

export type FetchOutcome =
  | { kind: "ok";         markdown: string; title?: string; via: string; httpStatus?: number; etag?: string; lastModified?: string; bytes?: number }
  | { kind: "not_modified"; httpStatus: 304; via: string; etag?: string; lastModified?: string }
  | { kind: "gone";       httpStatus: 404 | 410 }
  | { kind: "blocked";    reason: string }
  | { kind: "error";      reason: string; httpStatus?: number };

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
  const row = data as { next_fetch_at: string; etag: string | null; last_modified: string | null; status: string; interval_hours: number };
  if (row.status === "gone")    return { fetch: false, reason: "gone" };
  if (row.status === "blocked") return { fetch: false, reason: "blocked" };
  const due = new Date(row.next_fetch_at).getTime() <= Date.now();
  if (!due) return { fetch: false, reason: "not_due_yet", etag: row.etag ?? undefined, lastModified: row.last_modified ?? undefined };
  return {
    fetch: true, reason: "due",
    etag: row.etag ?? undefined,
    lastModified: row.last_modified ?? undefined,
    intervalHours: row.interval_hours,
  };
}

export async function recordFetch(
  url: string,
  outcome: FetchOutcome,
  opts: { funderId?: string | null; previousIntervalHours?: number | null } = {},
): Promise<{ next_fetch_at: string; status: string; changed: boolean; interval_hours: number; content_hash: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();

  // Load current row (we need previous hash + interval to decide cadence).
  const { data: prev } = await sb
    .from("crawl_ledger")
    .select("content_hash, interval_hours, change_count, fetch_count, error_count")
    .eq("url", url)
    .maybeSingle();
  const prevRow = (prev ?? null) as { content_hash: string | null; interval_hours: number; change_count: number; fetch_count: number; error_count: number } | null;
  const prevInterval = prevRow?.interval_hours ?? opts.previousIntervalHours ?? 24;

  let status: string;
  let nextIntervalHours: number;
  let contentHash: string | null = prevRow?.content_hash ?? null;
  let changeCount = prevRow?.change_count ?? 0;
  const fetchCount = (prevRow?.fetch_count ?? 0) + 1;
  let errorCount  = prevRow?.error_count ?? 0;
  let changed = false;
  let via: string | null = null;
  let httpStatus: number | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;
  let bytes: number | null = null;
  let title: string | null = null;
  let lastError: string | null = null;

  switch (outcome.kind) {
    case "ok": {
      via = outcome.via;
      httpStatus = outcome.httpStatus ?? 200;
      etag = outcome.etag ?? null;
      lastModified = outcome.lastModified ?? null;
      bytes = outcome.bytes ?? outcome.markdown.length;
      title = outcome.title ?? null;
      const newHash = sha256(outcome.markdown);
      if (prevRow?.content_hash && prevRow.content_hash !== newHash) {
        status = "changed";
        changed = true;
        changeCount += 1;
        nextIntervalHours = clamp(Math.floor(prevInterval * 0.5), 6, 336);
      } else if (prevRow?.content_hash === newHash) {
        status = "unchanged";
        nextIntervalHours = clamp(Math.floor(prevInterval * 1.5), 24, 336);
      } else {
        status = "ok";
        nextIntervalHours = 24;
      }
      contentHash = newHash;
      break;
    }
    case "not_modified": {
      via = outcome.via;
      httpStatus = 304;
      etag = outcome.etag ?? null;
      lastModified = outcome.lastModified ?? null;
      status = "unchanged";
      nextIntervalHours = clamp(Math.floor(prevInterval * 1.5), 24, 336);
      break;
    }
    case "gone": {
      status = "gone";
      httpStatus = outcome.httpStatus;
      nextIntervalHours = 720; // 30d sanity recheck
      break;
    }
    case "blocked": {
      status = "blocked";
      lastError = outcome.reason;
      nextIntervalHours = 168; // 7d
      break;
    }
    case "error": {
      status = "error";
      httpStatus = outcome.httpStatus ?? null;
      lastError = outcome.reason;
      errorCount += 1;
      nextIntervalHours = clamp(Math.floor(prevInterval * 2), 24, 168);
      break;
    }
  }

  const nextFetchAt = new Date(Date.now() + nextIntervalHours * 3600_000).toISOString();
  const row = {
    url, host,
    funder_id: opts.funderId ?? null,
    last_fetched_at: new Date().toISOString(),
    next_fetch_at: nextFetchAt,
    interval_hours: nextIntervalHours,
    content_hash: contentHash,
    etag, last_modified: lastModified,
    change_count: changeCount,
    status, http_status: httpStatus,
    fetch_count: fetchCount, error_count: errorCount,
    last_error: lastError,
    via, bytes, title,
  };

  // upsert
  const { error } = await supabaseAdmin
    .from("crawl_ledger")
    .upsert(row as never, { onConflict: "url" });
  if (error) throw new Error(`ledger_upsert_failed: ${error.message}`);

  return { next_fetch_at: nextFetchAt, status, changed, interval_hours: nextIntervalHours, content_hash: contentHash };
}

export async function ledgerStats(funderId?: string): Promise<{
  due_now: number; queued_24h: number; stable: number; gone: number; blocked: number; errored: number; total: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("crawl_ledger").select("status, next_fetch_at", { count: "exact" });
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
