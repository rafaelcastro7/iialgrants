// Server-only implementation of grant discovery for a single funder.
// Extracted from runDiscoverer (serverFn) so it can be called directly from
// other server contexts (other serverFns, webhooks) WITHOUT going through the
// TanStack server-fn resolver — which fails with
// "Server function info not found" when invoked from another serverFn handler.
//
// runDiscoverer (serverFn) is a thin wrapper around this function.

import { z } from "zod";
import { createHash } from "crypto";
import { DiscoveredGrant, PROMPTS } from "@/agents/schemas";

const MAX_PAGES_PER_RUN = 12;
const MAX_MARKDOWN_LEN = 22_000;
const SCRAPE_CONCURRENCY = 3;

// Hard title normalization for canonical dedup. Strips:
//   - parenthetical content "(IRAP)" / "(programme XYZ)"
//   - generic suffix words: program/programme/initiative/fund/funding/grant/
//     subsidy/subvention/aide/credit/crédit
//   - all non-alphanumeric chars, then collapses whitespace.
// Result: "NRC IRAP (Industrial Research Assistance Program)" and
// "NRC IRAP - Industrial Research Assistance" both collapse to the same key.
const GENERIC_STOPWORDS = new Set([
  "program","programme","initiative","fund","funding","grant","grants",
  "subsidy","subsidies","subvention","subventions","aide","aides",
  "credit","crédit","credits","crédits","loan","loans","prêt","prets","prêts",
  "scholarship","bourse","bourses","the","a","an","le","la","les","de","du","des",
]);

function normalizeTitle(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ")              // strip parentheticals
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")          // strip diacritics
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GENERIC_STOPWORDS.has(w))
    .join(" ");
}
function canonicalKey(funderId: string, title: string, minAmt: number | null, maxAmt: number | null): string {
  const band = `${minAmt ?? "_"}_${maxAmt ?? "_"}`;
  return createHash("sha256").update(`${funderId}|${normalizeTitle(title)}|${band}`).digest("hex");
}

// Reject titles that are too generic to be real programs.
// E.g. "Funding", "Loans", "Programs and Initiatives", landing-page bait.
function isGenericTitle(title: string): boolean {
  const norm = normalizeTitle(title);
  if (norm.length < 4) return true;
  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true; // After stopword removal, must have ≥3 meaningful words.
  return false;
}

// Reject root-ish index URLs that aren't actual program pages.
// Paths like /financement, /prets, /programmes, /grants, /funding are
// listing pages that the Discoverer should NOT scrape as a single program.
const ROOT_INDEX_PATHS = new Set([
  "/financement","/financements","/funding","/funds","/fund",
  "/prets","/prêts","/loans","/loan","/subventions","/subvention",
  "/grants","/grant","/programmes","/programme","/programs","/program",
  "/aides","/aide","/credits","/crédits","/credit","/crédit",
  "/scholarships","/bourses","/services","/produits","/products",
]);
function isRootIndex(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path || path === "/") return true;
    if (ROOT_INDEX_PATHS.has(path)) return true;
    // Single-segment path with one of the generic words → also reject.
    const segs = path.split("/").filter(Boolean);
    if (segs.length === 1 && ROOT_INDEX_PATHS.has(`/${segs[0]}`)) return true;
    return false;
  } catch { return false; }
}

// Multi-grant page output: a page (index or program) may yield 0..N grants.
const MultiPageOutput = z.object({
  grants: z.array(DiscoveredGrant).max(25).default([]),
});

// Schema sent to Firecrawl's JSON extractor. Looser than our internal Zod
// because Firecrawl's model occasionally returns extra fields or omits some;
// we re-validate with DiscoveredGrant before insert.
const FIRECRAWL_JSON_SCHEMA = {
  type: "object",
  properties: {
    grants: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Official program name" },
          title_fr: { type: ["string", "null"], description: "French (Quebec) title if present" },
          summary: { type: ["string", "null"], description: "1-3 sentence description" },
          summary_fr: { type: ["string", "null"] },
          amount_cad_min: { type: ["number", "null"], description: "Min funding in CAD" },
          amount_cad_max: { type: ["number", "null"], description: "Max funding in CAD" },
          deadline: { type: ["string", "null"], description: "ISO YYYY-MM-DD or null" },
          eligibility: { type: "object" },
          sectors: { type: "array", items: { type: "string" } },
          language: { type: "string", enum: ["en", "fr"] },
          url: { type: "string", description: "Canonical program URL" },
        },
        required: ["title", "language", "url"],
      },
    },
  },
  required: ["grants"],
} as const;

const JSON_PROMPT =
  "Extract every distinct Canadian funding program described on this page. " +
  "If the page is an index that lists multiple programs with links, extract one entry per listed program using the link as `url`. " +
  "Use Canadian dollars; never invent amounts or deadlines (null if unknown). " +
  "Deadlines must be ISO YYYY-MM-DD or null. Detect language ('en' or 'fr') from the text.";


export type DiscoveryResult = {
  ok: boolean;
  inserted: number;
  seenAgain?: number;
  urlsMapped?: number;
  urlsScraped?: number;
  found?: number;
  degraded?: boolean;
  engine: "firecrawl_v2" | "fallback";
  runId: string;
  error?: string;
};

export type DiscoverFunderOptions = {
  jobId?: string;
  attempt?: number;
  funderName?: string;
};

export async function discoverFunderImpl(
  funderId: string,
  opts: DiscoverFunderOptions = {},
): Promise<DiscoveryResult> {
  const { callLlm } = await import("@/agents/llm.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { newRunId } = await import("@/lib/otel");
  const { firecrawlAvailable, firecrawlMap, filterProgramUrls } =
    await import("@/lib/firecrawl.server");
  const { scrapeWithFallback, jinaSearch } = await import("@/lib/web-fetch.server");

  const runId = newRunId();
  const t0 = Date.now();
  const baseMeta = {
    job_id: opts.jobId ?? null,
    attempt: opts.attempt ?? 1,
  };

  const { data: funder, error: ferr } = await supabaseAdmin
    .from("funders")
    .select("id, name, source_url, source_urls, source_type")
    .eq("id", funderId)
    .maybeSingle();
  if (ferr) throw new Error(`funder_lookup_failed: ${ferr.message}`);
  if (!funder?.source_url) throw new Error("funder_has_no_source_url");
  const F = funder as { id: string; name: string; source_url: string; source_urls?: string[]; source_type?: string };

  // ----- Path A: structured extraction (Firecrawl preferred, Jina/raw fallback) -----
  if (firecrawlAvailable()) {
    const indexUrls: string[] = [F.source_url, ...(F.source_urls ?? [])];
    const mapped = new Set<string>();
    // First pass: search-focused map (Firecrawl ranks results by relevance).
    for (const idx of indexUrls) {
      const m = await firecrawlMap(idx, 100, "program funding grant subvention financement");
      if (m.ok) m.links.forEach((l) => mapped.add(l));
    }
    // Fallback pass: plain map for any funder whose search returned nothing.
    if (mapped.size < 5) {
      for (const idx of indexUrls) {
        const m = await firecrawlMap(idx, 100);
        if (m.ok) m.links.forEach((l) => mapped.add(l));
      }
    }
    // Last-resort seeding: free Jina Search constrained to the funder host.
    // Helps when Firecrawl map returns nothing (paywalled sitemaps, JS-only nav).
    let seedSearchUsed = 0;
    if (mapped.size < 3) {
      try {
        const host = new URL(F.source_url).host;
        const r = await jinaSearch(`site:${host} (program OR funding OR grant OR subvention OR financement)`, 20);
        if (r.ok) {
          r.hits.forEach((h) => mapped.add(h.url));
          seedSearchUsed = r.hits.length;
        }
      } catch { /* ignore */ }
    }
    indexUrls.forEach((u) => mapped.add(u));

    const origin = new URL(F.source_url).origin;
    const candidates = filterProgramUrls([...mapped], origin).slice(0, MAX_PAGES_PER_RUN);

    let inserted = 0;
    let seenAgain = 0;
    let skipped = 0;
    let foundTotal = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const viaCounts = { firecrawl_json: 0, firecrawl: 0, jina_reader: 0, raw_html: 0 } as Record<string, number>;
    const perPageStats: Array<{ url: string; found: number; via: string; reason?: string }> = [];

    // Scrape pages in parallel (bounded). Firecrawl JSON mode handles many
    // pages cheaply and returns multiple grants per index page; falls back to
    // Jina Reader (free) then raw HTML on transient failures.
    async function processOne(url: string): Promise<void> {
      const scrape = await scrapeWithFallback(url, {
        jsonSchema: FIRECRAWL_JSON_SCHEMA,
        jsonPrompt: JSON_PROMPT,
      });
      if (!scrape.ok) {
        skipped++;
        perPageStats.push({ url, found: 0, via: "skipped", reason: scrape.error });
        return;
      }
      viaCounts[scrape.via] = (viaCounts[scrape.via] ?? 0) + 1;

      // Try Firecrawl-extracted JSON first (cheaper + more reliable).
      let pageGrants: z.infer<typeof DiscoveredGrant>[] = [];
      let via: string = scrape.via;

      if (scrape.json && typeof scrape.json === "object") {
        try {
          const candidate = (scrape.json as { grants?: unknown }).grants;
          if (Array.isArray(candidate)) {
            for (const raw of candidate) {
              const r = raw as Record<string, unknown>;
              // Coerce URL to absolute (Firecrawl sometimes returns relative).
              if (typeof r.url === "string") {
                try { r.url = new URL(r.url, url).href; } catch { r.url = url; }
              } else {
                r.url = url;
              }
              const parsed = DiscoveredGrant.safeParse(r);
              if (parsed.success) pageGrants.push(parsed.data);
            }
          }
        } catch { /* fall through to LLM */ }
      }

      // Fallback to in-process LLM if no structured JSON was returned (e.g.
      // Jina Reader / raw HTML paths, or Firecrawl JSON empty).
      if (pageGrants.length === 0) {
        const md = scrape.markdown.slice(0, MAX_MARKDOWN_LEN);
        if (md.length < 200) {
          skipped++;
          perPageStats.push({ url, found: 0, via: "skipped", reason: "page_too_short" });
          return;
        }
        const llm = await callLlm({
          model: "google/gemini-2.5-flash",
          agent: "discoverer",
          runId,
          temperature: 0.1,
          responseFormat: "json",
          messages: [
            { role: "system", content:
              `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}\n` +
              `Extract every distinct Canadian funding program described on this page. ` +
              `If the page is an index listing multiple programs, return one entry per listed program. ` +
              `If nothing is a real program, return { "grants": [] }.` },
            { role: "user", content:
              `Funder: ${F.name}\nPage URL: ${url}\nPage title: ${scrape.title ?? ""}\n\n` +
              `Markdown:\n${md}\n\n` +
              `Return JSON: { "grants": [ { "title", "title_fr"?, "summary"?, "summary_fr"?, ` +
              `"amount_cad_min"?, "amount_cad_max"?, "deadline"?, "eligibility"?, "sectors"?, ` +
              `"language", "url" } ] }` },
          ],
        });
        inputTokens += llm.inputTokens ?? 0;
        outputTokens += llm.outputTokens ?? 0;
        try {
          const parsed = MultiPageOutput.parse(JSON.parse(llm.text));
          pageGrants = parsed.grants;
          via = `${scrape.via}+llm`;
        } catch {
          skipped++;
          perPageStats.push({ url, found: 0, via: "skipped", reason: "schema_validation" });
          return;
        }
      }

      foundTotal += pageGrants.length;
      perPageStats.push({ url, found: pageGrants.length, via });

      for (const g of pageGrants) {
        if (isGenericTitle(g.title) || isRootIndex(g.url || url)) {
          continue; // structural filter: skip landing-page / index-only entries
        }
        const ck = canonicalKey(F.id, g.title, g.amount_cad_min ?? null, g.amount_cad_max ?? null);
        const { data: existing } = await supabaseAdmin
          .from("grants").select("id, times_seen").eq("canonical_key", ck).maybeSingle();
        if (existing) {
          await supabaseAdmin.from("grants").update({
            last_seen_at: new Date().toISOString(),
            times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
          } as never).eq("id", existing.id);
          seenAgain++;
          continue;
        }
        const sourceHash = createHash("sha256").update(`${g.url}|${g.title}`).digest("hex");
        const { error: ierr } = await supabaseAdmin.from("grants").insert({
          funder_id: F.id,
          title: g.title, title_fr: g.title_fr ?? null,
          summary: g.summary ?? null, summary_fr: g.summary_fr ?? null,
          amount_cad_min: g.amount_cad_min ?? null,
          amount_cad_max: g.amount_cad_max ?? null,
          deadline: g.deadline ?? null,
          eligibility: (g.eligibility ?? {}) as Record<string, unknown> as never,
          sectors: g.sectors ?? [],
          language: g.language,
          url: g.url || url,
          source_hash: sourceHash, canonical_key: ck, status: "discovered",
        });
        if (!ierr) inserted++;
      }
    }

    // Bounded concurrency.
    for (let i = 0; i < candidates.length; i += SCRAPE_CONCURRENCY) {
      await Promise.all(candidates.slice(i, i + SCRAPE_CONCURRENCY).map(processOne));
    }

    await supabaseAdmin
      .from("funders")
      .update({ last_discovered_at: new Date().toISOString() } as never)
      .eq("id", F.id);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "discoverer", status: "succeeded",
      model: "google/gemini-2.5-flash",
      latency_ms: Date.now() - t0,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      metadata: {
        ...baseMeta,
        funder_id: F.id, funder_name: F.name, engine: "firecrawl_v2",
        urls_mapped: mapped.size, urls_scraped: candidates.length,
        urls_skipped: skipped, found: foundTotal, inserted, seen_again: seenAgain,
        seed_search_used: seedSearchUsed,
        via_counts: viaCounts,
        per_page: perPageStats.slice(0, 12),
      },
    });
    return { ok: true, inserted, seenAgain, found: foundTotal, urlsMapped: mapped.size, urlsScraped: candidates.length, runId, engine: "firecrawl_v2" };
  }


  // ----- Path B: Fallback (no Firecrawl) -----
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let raw = "";
  try {
    const res = await fetch(F.source_url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "IIAL/0.1 (+https://iial.ca)" },
    });
    if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
    raw = (await res.text()).slice(0, 250_000);
  } finally { clearTimeout(timer); }

  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);

  if (text.length < 200) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "discoverer", status: "degraded",
      model: "google/gemini-2.5-flash", latency_ms: Date.now() - t0,
      error: "page_too_short",
      metadata: { ...baseMeta, funder_id: F.id, funder_name: F.name, engine: "fallback" },
    });
    return { ok: true, inserted: 0, runId, degraded: true, engine: "fallback" };
  }

  const llm = await callLlm({
    model: "google/gemini-2.5-flash",
    agent: "discoverer",
    runId, temperature: 0.1, responseFormat: "json",
    messages: [
      { role: "system", content: `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}` },
      { role: "user", content:
        `Funder: ${F.name}\nSource URL: ${F.source_url}\n\nPage text:\n${text}\n\n` +
        `Return JSON: { "grants": [ { "title", "title_fr"?, "summary"?, "summary_fr"?, ` +
        `"amount_cad_min"?, "amount_cad_max"?, "deadline"?, "eligibility"?, "sectors"?, "language", "url" } ] }` },
    ],
  });

  const { DiscovererOutput } = await import("@/agents/schemas");
  let parsed: ReturnType<typeof DiscovererOutput.parse>;
  try { parsed = DiscovererOutput.parse(JSON.parse(llm.text)); }
  catch (e) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "discoverer", status: "failed",
      model: "google/gemini-2.5-flash", latency_ms: Date.now() - t0,
      error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
      metadata: { ...baseMeta, funder_id: F.id, funder_name: F.name, engine: "fallback" },
    });
    return { ok: false, inserted: 0, runId, error: "schema_validation", engine: "fallback" };
  }

  let inserted = 0;
  let seenAgain = 0;
  for (const g of parsed.grants) {
    if (isGenericTitle(g.title) || isRootIndex(g.url)) continue;
    const ck = canonicalKey(F.id, g.title, g.amount_cad_min ?? null, g.amount_cad_max ?? null);
    const { data: existing } = await supabaseAdmin
      .from("grants").select("id, times_seen").eq("canonical_key", ck).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("grants").update({
        last_seen_at: new Date().toISOString(),
        times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
      } as never).eq("id", existing.id);
      seenAgain++; continue;
    }
    const sourceHash = createHash("sha256").update(`${g.url}|${g.title}`).digest("hex");
    const { error: ierr } = await supabaseAdmin.from("grants").insert({
      funder_id: F.id, title: g.title, title_fr: g.title_fr ?? null,
      summary: g.summary ?? null, summary_fr: g.summary_fr ?? null,
      amount_cad_min: g.amount_cad_min ?? null, amount_cad_max: g.amount_cad_max ?? null,
      deadline: g.deadline ?? null,
      eligibility: (g.eligibility ?? {}) as Record<string, unknown> as never,
      sectors: g.sectors ?? [], language: g.language, url: g.url,
      source_hash: sourceHash, canonical_key: ck, status: "discovered",
    });
    if (!ierr) inserted++;
  }

  await supabaseAdmin
    .from("funders")
    .update({ last_discovered_at: new Date().toISOString() } as never)
    .eq("id", F.id);

  await supabaseAdmin.from("agent_runs").insert({
    run_id: runId, agent: "discoverer", status: "succeeded",
    model: "google/gemini-2.5-flash",
    input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
    latency_ms: Date.now() - t0,
    metadata: { ...baseMeta, funder_id: F.id, funder_name: F.name, engine: "fallback", found: parsed.grants.length, inserted, seen_again: seenAgain },
  });
  return { ok: true, inserted, seenAgain, found: parsed.grants.length, runId, engine: "fallback" };
}
