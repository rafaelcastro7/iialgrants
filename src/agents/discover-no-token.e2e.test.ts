// E2E — Discovery runs WITHOUT a Lovable API key.
//
// Contract: when the free-tier providers (Groq / Google AI Studio / Cerebras)
// are configured, the discovery pipeline performs LLM extraction through the
// free cascade and NEVER calls the Lovable AI Gateway, even when
// LOVABLE_API_KEY is completely absent from the environment.
//
// This is the proof for the user-stated requirement: "Garantiza que haga la
// búsqueda de grants sin tener que depender de tokens".

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// In-memory supabase (mirrors discover-enrich.gate.test pattern).
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

// Firecrawl mapping returns one program URL. Scrape returns markdown only
// (no JSON) → forces the LLM extraction path, which exercises callLlm →
// free cascade.
vi.mock("@/lib/firecrawl.server", () => ({
  firecrawlAvailable: () => true,
  firecrawlMap: async () => ({
    ok: true,
    links: ["https://seed.ca/programs/no-token-applied-research"],
  }),
  filterProgramUrls: (links: string[]) => links,
}));

const PAGE_MD = `
# Applied Research Catalyst (No-Token Edition)

Up to $250,000 CAD for Canadian nonprofits performing applied
research, feasibility studies, and pilot deployments in WCIS,
smart cities, and climate-aligned IoT.

Eligible applicants: registered Canadian nonprofits and charities.
Cost-share: up to 50% organizational contribution.
Deadline: rolling.
`.repeat(3);

vi.mock("@/lib/web-fetch.server", () => ({
  scrapeWithFallback: async (url: string) => ({
    ok: true,
    url,
    via: "firecrawl_markdown" as const,
    markdown: PAGE_MD,
    title: "Applied Research Catalyst",
    json: null,, attempts: []}),
  jinaSearch: async () => ({ ok: true, hits: [] }),
}));

vi.mock("@/lib/otel", () => ({ newRunId: () => "run_no_token", logGenAI: vi.fn() }));

// Block the agent-config lookup so resolveAgentConfig doesn't try to read
// from supabase (we already mock that, but this keeps the test focused).
vi.mock("@/lib/agent-config.server", () => ({
  resolveAgentConfig: async () => {
    throw new Error("config_unavailable_in_test");
  },
}));

const FUNDER_ID = "33333333-3333-3333-3333-333333333333";

const okBody = (text: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("Discovery runs with zero Lovable credits when free providers are configured", () => {
  const originalEnv = { ...process.env };
  const calls: string[] = [];

  beforeEach(() => {
    db.funders.length = 0; db.grants.length = 0; db.agent_runs.length = 0;
    calls.length = 0;

    // Critical: NO LOVABLE_API_KEY. Free providers only.
    delete process.env.LOVABLE_API_KEY;
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GOOGLE_AI_STUDIO_KEY = "test-gemini-key";
    process.env.CEREBRAS_API_KEY = "test-cerebras-key";

    // Spy on fetch — only the free-provider URLs are allowed.
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url === LOVABLE_URL) {
          throw new Error("REGRESSION: Lovable Gateway was called despite free providers being available");
        }
        if (url === GROQ_URL) {
          // Groq returns valid JSON discovery output → succeeds first try.
          return okBody(JSON.stringify({
            grants: [{
              title: "Applied Research Catalyst (No-Token Edition)",
              summary: "Up to $250k for nonprofits doing applied research.",
              amount_cad_min: null,
              amount_cad_max: 250000,
              deadline: null,
              eligibility: { applicant_types: ["nonprofit"] },
              sectors: ["applied research", "wcis", "smart city"],
              language: "en",
              url: "https://seed.ca/programs/no-token-applied-research",
            }],
          }));
        }
        throw new Error(`unexpected fetch in no-token test: ${url}`);
      },
    );

    db.funders.push({
      id: FUNDER_ID, name: "No-Token Funder",
      source_url: "https://seed.ca/", source_urls: [], source_type: "manual",
    });

    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("inserts grants through Groq (free) without ever calling Lovable Gateway", async () => {
    const { discoverFunderImpl } = await import("./discoverer.impl.server");
    const res = await discoverFunderImpl(FUNDER_ID);

    expect(res.ok, `discoverer error: ${res.error ?? "(none)"}`).toBe(true);
    expect(res.inserted).toBeGreaterThanOrEqual(1);
    expect(db.grants.length).toBeGreaterThanOrEqual(1);

    // Hard guarantee: no token spent on Lovable.
    expect(calls).not.toContain(LOVABLE_URL);
    // Confirm extraction actually went through a free provider.
    expect(calls.some((u) => u === GROQ_URL || u === GEMINI_URL || u === CEREBRAS_URL)).toBe(true);
  });

  it("LOVABLE_API_KEY remains unset for the entire run", async () => {
    expect(process.env.LOVABLE_API_KEY).toBeUndefined();
    const { discoverFunderImpl } = await import("./discoverer.impl.server");
    await discoverFunderImpl(FUNDER_ID);
    expect(process.env.LOVABLE_API_KEY).toBeUndefined();
    expect(calls).not.toContain(LOVABLE_URL);
  });
});
