// CI GATE — Discover & Enrich end-to-end with seeded data.
//
// Purpose: fail the build immediately if either
//   (a) the discovery pipeline returns a different grant count for the same
//       seeded fixtures (regression in filters / extractors / dedup), or
//   (b) any error is surfaced from discovery OR from screening-rule
//       evaluation against the resulting grants.
//
// Pinned counts are SNAPSHOTS — bump them deliberately in the same PR that
// changes filter logic; otherwise treat a mismatch as a regression.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { funders: [], grants: [], agent_runs: [] };
function makeQuery(table: string) {
  const state: { filters: Array<[string, unknown]> } = { filters: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: any = {};
  api.select = () => api;
  api.eq = (c: string, v: unknown) => { state.filters.push([c, v]); return api; };
  const match = () => db[table].filter((r) => state.filters.every(([c, v]) => r[c] === v));
  api.maybeSingle = async () => ({ data: match()[0] ?? null, error: null });
  api.insert = async (p: Row | Row[]) => {
    const rows = Array.isArray(p) ? p : [p];
    for (const r of rows) db[table].push({ id: r.id ?? `id_${db[table].length + 1}`, ...r });
    return { error: null };
  };
  api.update = (patch: Row) => ({
    eq: (c: string, v: unknown) => {
      state.filters.push([c, v]);
      for (const r of match()) Object.assign(r, patch);
      return Promise.resolve({ error: null });
    },
  });
  return api;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => makeQuery(t) },
}));

vi.mock("@/lib/firecrawl.server", () => ({
  firecrawlAvailable: () => true,
  firecrawlMap: async () => ({
    ok: true,
    links: [
      "https://seed.ca/programs/iial-applied-research",
      "https://seed.ca/programs/smart-city-pilot",
      "https://seed.ca/programs/wcis-traceability",
      "https://seed.ca/financement",
    ],
  }),
  filterProgramUrls: (links: string[]) => links.filter((u) => !u.endsWith("/about")),
}));

vi.mock("@/lib/web-fetch.server", () => ({
  scrapeWithFallback: async (url: string) => ({
    ok: true, url, via: "firecrawl_json" as const, markdown: "x", title: "x",
    json: {
      grants: url.includes("applied-research") ? [{
        title: "IIAL Applied Research Catalyst",
        summary: "Up to $200k for Canadian nonprofits doing applied research and feasibility studies.",
        amount_cad_min: 50_000, amount_cad_max: 200_000, deadline: null,
        eligibility: { applicant_types: ["nonprofit"] }, sectors: ["applied research", "feasibility"],
        language: "en", url, country: "CA",
      }] : url.includes("smart-city-pilot") ? [{
        title: "Smart City IoT Pilot Fund",
        summary: "Climate-aligned AIoT pilots for municipalities partnering with nonprofits.",
        amount_cad_max: 500_000, eligibility: {}, sectors: ["smart city", "iot", "climate"],
        language: "en", url, country: "CA",
      }] : url.includes("wcis-traceability") ? [{
        title: "WCIS Supply Chain Traceability Grant",
        summary: "Funds WCIS, traceability and micro-credential delivery for SMEs.",
        amount_cad_min: 25_000, amount_cad_max: 150_000,
        eligibility: { applicant_types: ["nonprofit"] },
        sectors: ["supply chain", "wcis", "certification"], language: "en", url, country: "CA",
      }] : [],
    },
  }),
  jinaSearch: async () => ({ ok: true, hits: [] }),
}));

vi.mock("@/agents/llm.server", () => ({
  callLlm: vi.fn(async () => ({ text: '{"grants":[]}', inputTokens: 0, outputTokens: 0, runId: "stub" })),
}));
vi.mock("@/lib/otel", () => ({ newRunId: () => "run_gate", logGenAI: vi.fn() }));

import { discoverFunderImpl } from "./discoverer.impl.server";
import { DEFAULT_RULES, evaluateRules } from "./fit-rules.server";

const FUNDER_ID = "22222222-2222-2222-2222-222222222222";
// SNAPSHOT — change deliberately when filter logic changes.
const EXPECTED_GRANTS_INSERTED = 3;

beforeEach(() => {
  db.funders.length = 0; db.grants.length = 0; db.agent_runs.length = 0;
  db.funders.push({
    id: FUNDER_ID, name: "Gate Funder", source_url: "https://seed.ca/",
    source_urls: [], source_type: "manual",
  });
});

describe("CI gate — Discover & Enrich with seeded data", () => {
  it("inserts the exact pinned number of grants and reports no discovery error", async () => {
    const res = await discoverFunderImpl(FUNDER_ID);
    expect(res.ok, `discoverer error: ${res.error ?? "(none)"}`).toBe(true);
    expect(res.error ?? null).toBeNull();
    expect(res.inserted).toBe(EXPECTED_GRANTS_INSERTED);
    expect(db.grants).toHaveLength(EXPECTED_GRANTS_INSERTED);

    // agent_runs row succeeded with the right counts.
    expect(db.agent_runs).toHaveLength(1);
    const run = db.agent_runs[0] as Row;
    expect(run.status).toBe("succeeded");
    expect((run.metadata as Row).inserted).toBe(EXPECTED_GRANTS_INSERTED);
  });

  it("evaluates screening rules cleanly against every inserted grant", async () => {
    await discoverFunderImpl(FUNDER_ID);
    expect(db.grants.length).toBeGreaterThan(0);

    let passing = 0;
    for (const g of db.grants) {
      // Must not throw — proves rule engine wiring stays valid.
      const r = evaluateRules(DEFAULT_RULES, {
        eligibility: g.eligibility as Row,
        deadline: g.deadline as string | null,
        amount_cad_min: g.amount_cad_min as number | null,
        amount_cad_max: g.amount_cad_max as number | null,
        sectors: g.sectors as string[] | null,
        country: (g.country as string | null) ?? "CA",
        summary: g.summary as string | null,
        title: g.title as string,
      });
      expect(r.checks.length, `${g.title} produced no checks`).toBeGreaterThan(0);
      // No silent rule errors → every check has a known status.
      for (const c of r.checks) {
        expect(["pass", "fail", "warn", "skip"]).toContain(c.status);
      }
      if (!r.hard_fail) passing++;
    }
    // At least one seeded grant must pass the default IIAL rules — otherwise
    // the rule engine is over-rejecting (regression on filters).
    expect(passing, "every seeded grant hard-failed default rules").toBeGreaterThan(0);
  });

  it("is idempotent — re-running does not change grant count", async () => {
    await discoverFunderImpl(FUNDER_ID);
    const after1 = db.grants.length;
    await discoverFunderImpl(FUNDER_ID);
    expect(db.grants.length).toBe(after1);
  });
});
