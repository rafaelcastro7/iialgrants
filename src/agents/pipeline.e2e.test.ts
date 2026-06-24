// End-to-end wiring for the full grant lifecycle:
//   enrich → evaluate → shortlist → NotebookLM briefing (multi + deep-dive)
//
// Verifies:
//   • Deterministic enrichment populates evidence_spans
//   • Evaluator persists a grant_evaluations row + status="scored"
//   • Re-running enrich is a no-op (idempotent via status gate)
//   • Re-running evaluate upserts (no duplicate grant_evaluations)
//   • Shortlist → multi-grant briefing bumps status and writes grant_events
//   • Deep-dive (scope=single) preserves status and cites verifiable evidence
//
// No network, no Lovable credits. Every external boundary is mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb, makeSupabaseMock, type InMemoryDb } from "./__fixtures__/in-memory-supabase";

// ---------- Shared in-memory DB ----------
const db: InMemoryDb = createInMemoryDb({
  relations: {
    grants: [{ alias: "funder", foreignKey: "funder_id", target: "funders" }],
  },
  rpc: {
    has_role: () => true, // admin checks pass in tests
  },
});
const supabaseMock = makeSupabaseMock(db);

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: supabaseMock }));

// ---------- Web/Firecrawl mocks ----------
const MARKDOWN = [
  "Innovation Boost Program — overview.",
  "Eligible Canadian small and medium enterprises operating in clean technology and software.",
  "Funding between $50,000 and $250,000 per project.",
  "Application deadline: December 15, 2099.",
  "Non-profit organizations registered in Ontario may apply.",
].join("\n\n");

vi.mock("@/lib/web-fetch.server", () => ({
  scrapeWithFallback: async (url: string) => ({
    ok: true, url, via: "jina_reader" as const,
    markdown: MARKDOWN, title: "Innovation Boost Program",
  }),
  jinaSearch: async () => ({ ok: true, hits: [] }),
}));
vi.mock("@/lib/firecrawl.server", () => ({
  firecrawlAvailable: () => false,
  firecrawlScrape: async () => ({ ok: false, url: "", error: "no_api_key" }),
  firecrawlMap: async () => ({ ok: false, error: "no_api_key" }),
  filterProgramUrls: (l: string[]) => l,
}));

// ---------- LLM mocks ----------
vi.mock("@/agents/llm-free.server", () => ({
  freeProvidersAvailable: () => [],
  callFreeLlm: vi.fn(async () => { throw new Error("no_free_providers_in_test"); }),
}));

const evaluatorLlm = vi.fn(async () => ({
  text: JSON.stringify({
    fit_score: 1,
    eligibility_pass: true,
    rationale_en: "Strong alignment with IIAL clean-tech capability; eligible non-profit in Ontario.",
    rationale_fr: "",
  }),
  inputTokens: 100,
  outputTokens: 50,
  runId: "run_eval",
}));
vi.mock("@/agents/llm.server", () => ({ callLlm: evaluatorLlm }));

vi.mock("@/lib/otel", () => ({
  newRunId: (() => { let i = 0; return () => `run_test_${++i}`; })(),
  logGenAI: vi.fn(),
}));

// Admin agents gate / trace are no-ops in test.
vi.mock("@/lib/admin-agents.functions", () => ({ assertAgentEnabled: async () => {} }));
vi.mock("@/agents/trace.server", () => ({ traceStep: async () => {} }));

// ---------- SUT imports (after all mocks) ----------
import { enrichGrantImpl } from "./enricher.functions";
import { evaluateGrantImpl } from "./evaluator.impl.server";
import { buildNotebookBriefingImpl } from "@/lib/notebooklm.functions";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const FUNDER_ID = "00000000-0000-0000-0000-0000000000aa";
const GRANT_ID = "00000000-0000-0000-0000-0000000000bb";

beforeEach(() => {
  for (const t of Object.keys(db.tables)) db.tables[t] = [];
  evaluatorLlm.mockClear();

  db.tables.funders = [{
    id: FUNDER_ID, name: "Innovation Canada", jurisdiction: "CA",
    website: "https://innovation.ca", source_url: "https://innovation.ca/programs",
  }];
  db.tables.grants = [{
    id: GRANT_ID, funder_id: FUNDER_ID,
    title: "Innovation Boost Program",
    summary: "Up to $250k for Canadian SMEs.",
    amount_cad_min: null, amount_cad_max: null,
    deadline: null, eligibility: {}, sectors: [],
    language: "en", currency: "CAD",
    url: "https://innovation.ca/programs/innovation-boost",
    status: "discovered", fit_score: null,
    discovered_at: new Date().toISOString(),
    enriched_at: null, scored_at: null,
    enrich_attempts: 0,
  }];
  db.tables.org_profiles = [{
    id: "org_1", user_id: USER_ID,
    org_name: "IIAL Test Org",
    sectors: ["cleantech"], jurisdictions: ["CA", "ON"],
    stage: "operating", annual_budget_cad: 500000,
    focus_areas: ["climate", "smart_cities"],
  }];
  db.tables.evidence_spans = [];
  db.tables.grant_evaluations = [];
  db.tables.grant_events = [];
  db.tables.agent_runs = [];
  db.tables.agent_trace_steps = [];
  // Permissive rules so the deterministic engine doesn't hard-fail on
  // missing optional fields (e.g. grants.country isn't set in fixtures).
  db.tables.fit_rules = [{
    user_id: USER_ID,
    min_amount_cad: null, max_amount_cad: null,
    required_jurisdictions: [], excluded_jurisdictions: [],
    required_sectors: [], excluded_sectors: [],
    required_keywords: [], excluded_keywords: [],
    min_days_to_deadline: null,
    weight_llm: 0.4, threshold_fit_pass: 50,
    hard_fail_on_jurisdiction: false, hard_fail_on_excluded_keyword: false,
    hard_fail_on_amount: false, hard_fail_on_deadline: false,
    auto_archive_on_fail: false,
    applicant_types_allowed: [], applicant_types_excluded: [],
    lead_min_weeks: null, partner_min_weeks: null,
    iial_capabilities: [],
    max_cost_share_pct_org_carries: null,
    require_match_verification: false,
    rolling_intake_passes_runway: true,
    hard_fail_on_applicant_type: false, hard_fail_on_runway: false, hard_fail_on_capability: false,
  }];
});

describe("enrich → evaluate → shortlist → NotebookLM", () => {
  it("enriches a grant, persists evidence, transitions discovered → enriched", async () => {
    const r = await enrichGrantImpl(GRANT_ID);
    expect(r.ok).toBe(true);

    const g = db.tables.grants[0];
    expect(g.status).toBe("enriched");
    expect(g.enriched_at).toBeTruthy();
    // Deterministic extractors should have filled at least one structured field
    expect(g.amount_cad_max ?? g.amount_cad_min ?? g.deadline ?? (g.sectors as string[])?.length).toBeTruthy();

    // Evidence rows were recorded by recordEvidence()
    expect(db.tables.evidence_spans.length).toBeGreaterThan(0);
    for (const s of db.tables.evidence_spans) {
      expect(s.grant_id).toBe(GRANT_ID);
      expect(s.snippet).toBeTruthy();
    }

    // agent_runs has a successful row for the enricher
    const runs = db.tables.agent_runs.filter((r) => r.agent === "enricher");
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("succeeded");
  });

  it("re-running the enricher is idempotent (status gate)", async () => {
    await enrichGrantImpl(GRANT_ID);
    const evidenceCountAfterFirst = db.tables.evidence_spans.length;
    const runsAfterFirst = db.tables.agent_runs.length;

    const second = await enrichGrantImpl(GRANT_ID);
    expect(second.skipped).toBe(true);
    expect(second.reason).toMatch(/status=enriched|already_complete/);
    expect(db.tables.evidence_spans.length).toBe(evidenceCountAfterFirst); // no duplicate evidence
    // No second successful enrich run; only the original one persists
    expect(db.tables.agent_runs.length).toBe(runsAfterFirst);
  });

  it("evaluates an enriched grant, persists verdict, transitions enriched → scored", async () => {
    await enrichGrantImpl(GRANT_ID);
    const r = await evaluateGrantImpl({ grantId: GRANT_ID, userId: USER_ID, userSupabase: supabaseMock as never });
    expect(r.ok).toBe(true);
    expect(r.eligibility_pass).toBe(true);

    const g = db.tables.grants[0];
    expect(g.status).toBe("scored");
    expect(g.fit_score).toBe(r.fit_score);

    expect(db.tables.grant_evaluations).toHaveLength(1);
    const ev = db.tables.grant_evaluations[0];
    expect(ev.user_id).toBe(USER_ID);
    expect(ev.grant_id).toBe(GRANT_ID);
    expect(ev.rationale_en).toContain("clean-tech");

    // Evaluator wrote its own evidence rows (fit_score, eligibility_pass)
    const evalEvidence = db.tables.evidence_spans.filter((s) => s.agent === "evaluator");
    expect(evalEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it("re-running evaluate upserts evaluation AND dedupes evidence rows (no duplicates)", async () => {
    await enrichGrantImpl(GRANT_ID);
    await evaluateGrantImpl({ grantId: GRANT_ID, userId: USER_ID, userSupabase: supabaseMock as never });
    expect(db.tables.grant_evaluations[0].eligibility_pass).toBe(true);

    // Evaluator writes exactly one row per (grant, agent=evaluator, field).
    const evalEvidenceAfterFirst = db.tables.evidence_spans.filter(
      (s) => s.agent === "evaluator" && s.grant_id === GRANT_ID,
    );
    expect(evalEvidenceAfterFirst).toHaveLength(2); // fit_score + eligibility_pass
    const enricherEvidenceCount = db.tables.evidence_spans.filter((s) => s.agent !== "evaluator").length;

    // Change LLM verdict on second pass → upsert must overwrite, not insert.
    evaluatorLlm.mockResolvedValueOnce({
      text: JSON.stringify({
        fit_score: 0, eligibility_pass: false,
        rationale_en: "Re-evaluated: applicant type now disqualified after review.",
        rationale_fr: "",
      }),
      inputTokens: 100, outputTokens: 50, runId: "run_eval_2",
    });
    await evaluateGrantImpl({ grantId: GRANT_ID, userId: USER_ID, userSupabase: supabaseMock as never });

    expect(db.tables.grant_evaluations).toHaveLength(1); // upsert, no dup
    expect(db.tables.grant_evaluations[0].eligibility_pass).toBe(false);

    // Evidence: still exactly 2 evaluator rows, enricher rows untouched.
    const evalEvidenceAfterSecond = db.tables.evidence_spans.filter(
      (s) => s.agent === "evaluator" && s.grant_id === GRANT_ID,
    );
    expect(evalEvidenceAfterSecond).toHaveLength(2);
    expect(db.tables.evidence_spans.filter((s) => s.agent !== "evaluator").length)
      .toBe(enricherEvidenceCount);
    // And the new evaluator span carries the updated value.
    const fitSpan = evalEvidenceAfterSecond.find((s) => s.field === "fit_score");
    expect(fitSpan?.value).toBe(db.tables.grant_evaluations[0].fit_score);

    // Two evaluator agent_runs rows recorded (run history is append-only).
    const evalRuns = db.tables.agent_runs.filter((r) => r.agent === "evaluator");
    expect(evalRuns.length).toBe(2);
  });

  it("re-running shortlist via briefing is idempotent — no extra evidence, no duplicate events", async () => {
    await enrichGrantImpl(GRANT_ID);
    await evaluateGrantImpl({ grantId: GRANT_ID, userId: USER_ID, userSupabase: supabaseMock as never });

    const first = await buildNotebookBriefingImpl({
      data: { scope: "top-fit", maxItems: 10, autoShortlist: true },
      supabase: supabaseMock, userId: USER_ID,
    });
    if (!first.ok) throw new Error(`first briefing failed: ${first.reason}`);
    expect(first.shortlistedCount).toBe(1);
    const evidenceAfterFirst = db.tables.evidence_spans.length;
    const eventsAfterFirst = db.tables.grant_events.filter((e) => e.to_status === "shortlisted").length;
    expect(eventsAfterFirst).toBe(1);

    // Second briefing run: grant is already shortlisted, so toBump is empty.
    const second = await buildNotebookBriefingImpl({
      data: { scope: "top-fit", maxItems: 10, autoShortlist: true },
      supabase: supabaseMock, userId: USER_ID,
    });
    if (!second.ok) throw new Error(`second briefing failed: ${second.reason}`);
    expect(second.shortlistedCount).toBe(0);
    expect(db.tables.evidence_spans.length).toBe(evidenceAfterFirst); // briefing never writes evidence
    expect(db.tables.grant_events.filter((e) => e.to_status === "shortlisted").length)
      .toBe(eventsAfterFirst); // no duplicate transition event
  });

  it("multi-grant briefing auto-shortlists and writes grant_events", async () => {
    await enrichGrantImpl(GRANT_ID);
    await evaluateGrantImpl({ grantId: GRANT_ID, userId: USER_ID, userSupabase: supabaseMock as never });

    const out = await buildNotebookBriefingImpl({
      data: { scope: "top-fit", maxItems: 10, autoShortlist: true },
      supabase: supabaseMock, userId: USER_ID,
    });
    if (!out.ok) throw new Error(`briefing failed: ${out.reason}`);
    expect(out.count).toBe(1);
    expect(out.markdown).toContain("Innovation Boost Program");
    expect(out.markdown).toContain("Sources");
    expect(out.markdown).toContain("Innovation Canada");
    expect(out.shortlistedCount).toBe(1);

    expect(db.tables.grants[0].status).toBe("shortlisted");
    const events = db.tables.grant_events.filter((e) => e.to_status === "shortlisted");
    expect(events.length).toBe(1);
    expect((events[0].metadata as Record<string, unknown>).source).toBe("notebooklm_briefing");
  });

  it("deep-dive briefing (scope=single, grantId) cites evidence and does NOT shortlist", async () => {
    await enrichGrantImpl(GRANT_ID);
    await evaluateGrantImpl({ grantId: GRANT_ID, userId: USER_ID, userSupabase: supabaseMock as never });
    const statusBefore = db.tables.grants[0].status;
    const eventsBefore = db.tables.grant_events.length;

    const out = await buildNotebookBriefingImpl({
      data: { scope: "single", ids: [GRANT_ID], maxItems: 1, autoShortlist: true },
      supabase: supabaseMock, userId: USER_ID,
    });
    if (!out.ok) throw new Error(`briefing failed: ${out.reason}`);

    // Single-scope must skip auto-shortlist (the bridge's contract).
    expect(out.shortlistedCount).toBe(0);
    expect(db.tables.grants[0].status).toBe(statusBefore);
    expect(db.tables.grant_events.length).toBe(eventsBefore);

    // Deep-dive markdown must include grant id, title, fit rationale, evidence sources.
    expect(out.markdown).toContain("Deep-Dive");
    expect(out.markdown).toContain(GRANT_ID);
    expect(out.markdown).toContain("IIAL fit rationale");
    expect(out.markdown).toContain("Sources");
    expect(out.totalSpans).toBeGreaterThan(0);
    expect(out.grantsWithEvidence).toBe(1);

    // Every evidence span surfaced in the briefing has a verifiable URL.
    expect(out.markdown).toContain("https://innovation.ca/programs/innovation-boost");
  });
});
