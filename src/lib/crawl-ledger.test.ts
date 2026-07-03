// Adaptive recrawl cadence math (Nutch-style). These tests stub the
// supabaseAdmin client so they don't touch the network.
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory ledger state.
let store = new Map<string, Record<string, unknown>>();

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
    upsert(row: Record<string, unknown>) {
      store.set(row.url as string, row);
      return Promise.resolve({ error: null });
    },
  };
  return { supabaseAdmin: { from: (t: string) => builder.from(t) } };
});

import { shouldFetch, recordFetch } from "@/lib/crawl-ledger.server";

beforeEach(() => {
  store = new Map();
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
});
