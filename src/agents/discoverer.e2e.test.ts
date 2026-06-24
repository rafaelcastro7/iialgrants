// End-to-end wiring test for the grant discovery pipeline.
//
// Exercises discoverFunderImpl with the entire real pipeline (Firecrawl map →
// filter → scrape → JSON extract → canonical dedup → insert → agent_runs)
// against in-memory mocks for every external boundary (Supabase, Firecrawl,
// web fetch, LLM, OTel). No network, no credits. Validates that:
//   1. Funder lookup is performed
//   2. Firecrawl map URLs are filtered + scraped
//   3. Generic titles and root-index URLs are dropped
//   4. Canonical-key dedup updates `times_seen` instead of double-insert
//   5. Real programs land in `grants` with funder_id, canonical_key, status
//   6. `agent_runs` records the run with engine + per-page stats
//   7. `funders.last_discovered_at` is bumped

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- In-memory Supabase ----------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { funders: [], grants: [], agent_runs: [] };

function makeQuery(table: string) {
  const state: { filters: Array<[string, unknown]> } = { filters: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: any = {};
  api.select = () => api;
  api.eq = (col: string, val: unknown) => { state.filters.push([col, val]); return api; };
  const rowsMatching = () =>
    db[table].filter((r) => state.filters.every(([c, v]) => r[c] === v));
  api.maybeSingle = async () => ({ data: rowsMatching()[0] ?? null, error: null });
  api.insert = async (payload: Row | Row[]) => {
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const r of rows) db[table].push({ id: r.id ?? `id_${db[table].length + 1}`, ...r });
    return { error: null };
  };
  api.update = (patch: Row) => ({
    eq: (col: string, val: unknown) => {
      state.filters.push([col, val]);
      for (const r of rowsMatching()) Object.assign(r, patch);
      return Promise.resolve({ error: null });
    },
  });
  return api;
}
const supabaseAdmin = { from: (t: string) => makeQuery(t) };

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

// ---------- Firecrawl ----------
vi.mock("@/lib/firecrawl.server", () => ({
  firecrawlAvailable: () => true,
  firecrawlMap: async () => ({
    ok: true,
    links: [
      "https://example.ca/programs/innovation-boost",
      "https://example.ca/programs/clean-tech-fund",
      "https://example.ca/financement", // root index — must be filtered
      "https://example.ca/about",       // skip pattern
    ],
  }),
  filterProgramUrls: (links: string[]) =>
    links.filter((u) => !u.endsWith("/about")), // mimic real filter minimally
}));

// ---------- Web fetch (Firecrawl JSON path) ----------
vi.mock("@/lib/web-fetch.server", () => ({
  scrapeWithFallback: async (url: string) => ({
    ok: true,
    url,
    via: "firecrawl_json" as const,
    markdown: "ignored when json present",
    title: "Page",
    json: {
      grants: url.includes("innovation-boost")
        ? [
            {
              title: "Innovation Boost Program for SMEs",
              summary: "Up to $250k for Canadian SMEs.",
              amount_cad_min: 50000,
              amount_cad_max: 250000,
              deadline: null,
              eligibility: { applicant_types: ["nonprofit"] },
              sectors: ["innovation"],
              language: "en",
              url,
            },
            // Generic-title row — must be dropped by isGenericTitle
            { title: "Funding", language: "en", url },
          ]
        : url.includes("clean-tech-fund")
          ? [
              {
                title: "Clean Tech Acceleration Fund",
                summary: "Climate-focused grants.",
                amount_cad_max: 1_000_000,
                language: "en",
                url,
                eligibility: {},
                sectors: ["climate"],
              },
            ]
          : [],
    },
  }),
  jinaSearch: async () => ({ ok: true, hits: [] }),
}));

// ---------- LLM (shouldn't be hit on JSON path, but stub anyway) ----------
vi.mock("@/agents/llm.server", () => ({
  callLlm: vi.fn(async () => ({ text: '{"grants":[]}', inputTokens: 0, outputTokens: 0, runId: "stub" })),
}));

vi.mock("@/lib/otel", () => ({ newRunId: () => "run_test_1", logGenAI: vi.fn() }));

// ---------- Test ----------
import { discoverFunderImpl } from "./discoverer.impl.server";

const FUNDER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  db.funders.length = 0;
  db.grants.length = 0;
  db.agent_runs.length = 0;
  db.funders.push({
    id: FUNDER_ID,
    name: "Test Funder",
    source_url: "https://example.ca/",
    source_urls: [],
    source_type: "manual",
  });
});

describe("discoverFunderImpl — end-to-end pipeline", () => {
  it("scrapes, filters, dedups, and inserts only real grants", async () => {
    const res = await discoverFunderImpl(FUNDER_ID);

    expect(res.ok).toBe(true);
    expect(res.engine).toBe("firecrawl_v2");
    expect(res.urlsScraped).toBeGreaterThan(0);
    // 2 real + 1 generic + 0 → 2 inserted, generic dropped, root-index dropped
    expect(res.inserted).toBe(2);

    const titles = db.grants.map((g) => g.title).sort();
    expect(titles).toEqual([
      "Clean Tech Acceleration Fund",
      "Innovation Boost Program for SMEs",
    ]);
    for (const g of db.grants) {
      expect(g.funder_id).toBe(FUNDER_ID);
      expect(g.status).toBe("discovered");
      expect(typeof g.canonical_key).toBe("string");
      expect((g.canonical_key as string).length).toBeGreaterThan(10);
    }

    // agent_runs row exists with run metadata
    expect(db.agent_runs).toHaveLength(1);
    const run = db.agent_runs[0] as Row;
    expect(run.agent).toBe("discoverer");
    expect(run.status).toBe("succeeded");
    expect((run.metadata as Row).engine).toBe("firecrawl_v2");
    expect((run.metadata as Row).inserted).toBe(2);

    // funder.last_discovered_at bumped
    expect(db.funders[0].last_discovered_at).toBeTruthy();
  });

  it("dedups on second run via canonical_key (no double-insert)", async () => {
    await discoverFunderImpl(FUNDER_ID);
    const afterFirst = db.grants.length;
    await discoverFunderImpl(FUNDER_ID);
    expect(db.grants.length).toBe(afterFirst); // no new rows
    // times_seen incremented on existing rows
    for (const g of db.grants) {
      expect((g.times_seen as number | undefined) ?? 1).toBeGreaterThanOrEqual(2);
    }
  });
});
