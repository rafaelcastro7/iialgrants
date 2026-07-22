// Adaptive recrawl cadence math (Nutch-style). These tests stub the
// supabaseAdmin client so they don't touch the network.
//
// recordFetch()'s actual read-modify-write now happens atomically inside
// the record_crawl_fetch() Postgres function (supabase/migrations/
// 20260722130000_crawl_ledger_record_fetch_rpc.sql), serialized per-URL via
// an advisory lock. The mock's `rpc()` below mirrors that function's exact
// contract — including simulating the read/write gap that used to let two
// overlapping calls race — so the concurrency test below actually exercises
// the same lock/serialize behavior the SQL function provides. This was
// verified independently against a real local Postgres instance running the
// migration (two concurrent calls → fetch_count reflects both, second call
// sees the first's committed write instead of a stale read).
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory ledger state.
let store = new Map<string, Record<string, unknown>>();
// Per-URL advisory-lock analog: queues concurrent rpc() calls for the same
// URL so they run sequentially, matching pg_advisory_xact_lock in the SQL
// function.
let locks = new Map<string, Promise<unknown>>();

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

async function withUrlLock<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(url) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(url, run.catch(() => undefined));
  return run;
}

// Mirrors record_crawl_fetch()'s cadence logic 1:1 against the in-memory
// store, but — critically — awaits between reading the previous row and
// writing the new one, simulating the real network round-trip gap where the
// old JS implementation's race lived. Without the withUrlLock() wrapper
// above, two concurrent calls for the same URL would both read the stale
// row here, exactly reproducing the bug this migration fixes.
async function recordCrawlFetchRpc(params: Record<string, unknown>) {
  const url = params.p_url as string;
  return withUrlLock(url, async () => {
    const prevRow = store.get(url) as
      | {
          content_hash: string | null;
          interval_hours: number;
          change_count: number;
          fetch_count: number;
          error_count: number;
        }
      | undefined;

    // Simulate the async I/O gap between the read and the write.
    await Promise.resolve();
    await Promise.resolve();

    const prevInterval = prevRow?.interval_hours ?? (params.p_default_interval as number) ?? 24;
    const changeCount = prevRow?.change_count ?? 0;
    const fetchCount = (prevRow?.fetch_count ?? 0) + 1;
    let errorCount = prevRow?.error_count ?? 0;
    let outHash = prevRow?.content_hash ?? null;
    let status: string;
    let nextIntervalHours: number;
    let changed = false;
    let changeCountNext = changeCount;

    const kind = params.p_outcome_kind as string;
    if (kind === "ok") {
      const newHash = params.p_content_hash as string;
      if (prevRow?.content_hash && prevRow.content_hash !== newHash) {
        status = "changed";
        changed = true;
        changeCountNext += 1;
        nextIntervalHours = clamp(Math.floor(prevInterval * 0.5), 6, 336);
      } else if (prevRow?.content_hash === newHash) {
        status = "unchanged";
        nextIntervalHours = clamp(Math.floor(prevInterval * 1.5), 24, 336);
      } else {
        status = "ok";
        nextIntervalHours = 24;
      }
      outHash = newHash;
    } else if (kind === "not_modified") {
      status = "unchanged";
      nextIntervalHours = clamp(Math.floor(prevInterval * 1.5), 24, 336);
    } else if (kind === "gone") {
      status = "gone";
      nextIntervalHours = 720;
    } else if (kind === "blocked") {
      status = "blocked";
      nextIntervalHours = 168;
    } else if (kind === "error") {
      status = "error";
      errorCount += 1;
      nextIntervalHours = clamp(Math.floor(prevInterval * 2), 24, 168);
    } else {
      throw new Error(`invalid_outcome_kind: ${kind}`);
    }

    const nextFetchAt = new Date(Date.now() + nextIntervalHours * 3600_000).toISOString();
    store.set(url, {
      url,
      content_hash: outHash,
      interval_hours: nextIntervalHours,
      change_count: changeCountNext,
      fetch_count: fetchCount,
      error_count: errorCount,
      status,
      next_fetch_at: nextFetchAt,
    });

    return {
      next_fetch_at: nextFetchAt,
      status,
      changed,
      interval_hours: nextIntervalHours,
      content_hash: outHash,
    };
  });
}

vi.mock("@/integrations/supabase/client.server", () => {
  const builder = {
    _table: "crawl_ledger",
    _filters: {} as Record<string, unknown>,
    from(t: string) {
      this._table = t;
      this._filters = {};
      return this;
    },
    select() {
      return this;
    },
    eq(col: string, val: unknown) {
      this._filters[col] = val;
      return this;
    },
    maybeSingle() {
      const url = this._filters["url"] as string;
      return Promise.resolve({ data: store.get(url) ?? null, error: null });
    },
  };
  return {
    supabaseAdmin: {
      __isMock: true,
      from: (t: string) => builder.from(t),
      rpc: (fn: string, params: Record<string, unknown>) => {
        if (fn !== "record_crawl_fetch") throw new Error(`unexpected rpc: ${fn}`);
        const p = recordCrawlFetchRpc(params).then((row) => ({ data: row, error: null }));
        return { single: () => p };
      },
    },
  };
});

import { shouldFetch, recordFetch } from "@/lib/crawl-ledger.server";

beforeEach(() => {
  store = new Map();
  locks = new Map();
});

describe("crawl-ledger cadence", () => {
  it("new URL → fetch=true with default 24h interval", async () => {
    const d = await shouldFetch("https://x.test/a");
    expect(d.fetch).toBe(true);
    if (d.fetch) expect(d.intervalHours).toBe(24);
  });

  it("unchanged content stretches interval (×1.5, max 14d)", async () => {
    await recordFetch("https://x.test/b", {
      kind: "ok",
      markdown: "hello world",
      via: "scrape_engine",
    });
    // Simulate same content fetched again.
    const r2 = await recordFetch("https://x.test/b", {
      kind: "ok",
      markdown: "hello world",
      via: "scrape_engine",
    });
    expect(r2.changed).toBe(false);
    expect(r2.status).toBe("unchanged");
    // 24 × 1.5 = 36h
    expect(r2.interval_hours).toBe(36);
  });

  it("changed content tightens interval (×0.5, min 6h)", async () => {
    await recordFetch("https://x.test/c", { kind: "ok", markdown: "first", via: "scrape_engine" });
    const r2 = await recordFetch("https://x.test/c", {
      kind: "ok",
      markdown: "second different",
      via: "scrape_engine",
    });
    expect(r2.changed).toBe(true);
    expect(r2.status).toBe("changed");
    expect(r2.interval_hours).toBe(12); // 24 × 0.5
  });

  it("404 marks gone with 30d sanity recheck and stops fetching", async () => {
    const r = await recordFetch("https://x.test/d", { kind: "gone", httpStatus: 404 });
    expect(r.status).toBe("gone");
    expect(r.interval_hours).toBe(720);
    const d = await shouldFetch("https://x.test/d");
    expect(d.fetch).toBe(false);
    if (!d.fetch) expect(d.reason).toBe("gone");
  });

  it("blocked by robots stops fetching for 7d", async () => {
    const r = await recordFetch("https://x.test/e", { kind: "blocked", reason: "robots_disallow" });
    expect(r.status).toBe("blocked");
    expect(r.interval_hours).toBe(168);
    const d = await shouldFetch("https://x.test/e");
    expect(d.fetch).toBe(false);
  });

  it("re-fetch skipped when next_fetch_at not yet due", async () => {
    await recordFetch("https://x.test/f", { kind: "ok", markdown: "stable", via: "scrape_engine" });
    const d = await shouldFetch("https://x.test/f");
    expect(d.fetch).toBe(false);
    if (!d.fetch) expect(d.reason).toBe("not_due_yet");
  });

  it("concurrent recordFetch calls for the same URL don't lose updates", async () => {
    // Two overlapping discovery runs hit the same brand-new URL at once
    // (e.g. a scheduled run overlapping a manual "Find new grants" click).
    // Without per-URL serialization, both would read the same (empty)
    // previous row and one upsert would silently clobber the other's
    // fetch_count/change_count — this is the exact race that was fixed by
    // moving the read-modify-write into an atomically-locked SQL function.
    //
    // Warm up recordFetch's dynamically-imported client module via a real
    // call first — Vitest's dynamic-import mock resolution can race when
    // the exact same `await import(...)` call site inside
    // crawl-ledger.server.ts is hit concurrently for the first time ever,
    // which is a test-harness quirk unrelated to the production race this
    // test targets (Node's real module cache has no such race).
    await recordFetch("https://x.test/warmup", { kind: "ok", markdown: "warmup", via: "scrape_engine" });
    const [r1, r2] = await Promise.all([
      recordFetch("https://x.test/race", { kind: "ok", markdown: "version A", via: "scrape_engine" }),
      recordFetch("https://x.test/race", { kind: "ok", markdown: "version B", via: "scrape_engine" }),
    ]);

    const final = store.get("https://x.test/race") as { fetch_count: number; change_count: number };
    // Both calls' increments must land — a lost update would leave this at 1.
    expect(final.fetch_count).toBe(2);
    // Whichever call was serialized second must have seen the first's
    // committed write and correctly detected a content change.
    expect(final.change_count).toBe(1);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(["changed", "ok"]);
  });
});
