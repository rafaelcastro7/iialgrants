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

const MAX_PAGES_PER_RUN = 15;
const MAX_MARKDOWN_LEN = 22_000;
const SCRAPE_CONCURRENCY = 3;
const FALLBACK_MAX_LINKS = 12;
const FALLBACK_LLM_THROTTLE_MS = 2_200;

// Hard title normalization for canonical dedup. Strips:
//   - parenthetical content "(IRAP)" / "(programme XYZ)"
//   - generic suffix words: program/programme/initiative/fund/funding/grant/
//     subsidy/subvention/aide/credit/crédit
//   - all non-alphanumeric chars, then collapses whitespace.
// Result: "NRC IRAP (Industrial Research Assistance Program)" and
// "NRC IRAP - Industrial Research Assistance" both collapse to the same key.
const GENERIC_STOPWORDS = new Set([
  "program",
  "programme",
  "initiative",
  "fund",
  "funding",
  "grant",
  "grants",
  "subsidy",
  "subsidies",
  "subvention",
  "subventions",
  "aide",
  "aides",
  "credit",
  "crédit",
  "credits",
  "crédits",
  "loan",
  "loans",
  "prêt",
  "prets",
  "prêts",
  "scholarship",
  "bourse",
  "bourses",
  "the",
  "a",
  "an",
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
]);

export function normalizeTitle(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ") // strip parentheticals
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GENERIC_STOPWORDS.has(w))
    .join(" ");
}

// Tokens derived from the funder's own name (plus its initials acronym).
// The funder is already part of the canonical key via funderId, so its name
// inside a grant title is pure noise: "NRC Industrial Research Assistance
// Program (IRAP)", "National Research Council Canada Industrial Research
// Assistance Program (IRAP)" and "Industrial Research Assistance Program
// (IRAP)" are the same program and must collapse to one key. Live discovery
// on 2026-07-04 produced exactly those three as separate rows.
function funderNameTokens(funderName: string | null | undefined): Set<string> {
  if (!funderName) return new Set();
  const tokens = new Set<string>();
  // The funder's parenthetical is usually its acronym/alias — e.g.
  // "National Research Council Canada (IRAP)" → "irap".
  for (const m of funderName.matchAll(/\(([^)]+)\)/g)) {
    const inner = m[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (inner.length >= 2 && inner.length <= 12) tokens.add(inner);
  }
  const words = normalizeTitle(funderName).split(/\s+/).filter(Boolean);
  for (const w of words) tokens.add(w);
  // Titles abbreviate the funder inconsistently ("NRC" for "National Research
  // Council Canada"), so add the initials of every word-prefix of the name:
  // n·r → "nr", n·r·c → "nrc", n·r·c·c → "nrcc".
  for (let i = 2; i <= words.length; i++) {
    tokens.add(
      words
        .slice(0, i)
        .map((w) => w[0])
        .join(""),
    );
  }
  return tokens;
}

export function canonicalKey(funderId: string, title: string, funderName?: string | null): string {
  const drop = funderNameTokens(funderName);
  const all = normalizeTitle(title).split(/\s+/).filter(Boolean);
  // Sort so simple reorderings ("X Assistance Program" vs "Assistance
  // Program X") of the same funder's same words share one key. When the
  // title is nothing BUT the funder's name (drops to empty), fall back to
  // the undropped tokens so the key stays non-degenerate.
  const kept = all.filter((w) => !drop.has(w)).sort();
  const tokens = kept.length > 0 ? kept : [...all].sort();
  return createHash("sha256")
    .update(`${funderId}|${tokens.join(" ")}`)
    .digest("hex");
}

// Administrative / corporate pages that are NOT grant programs but routinely
// carry funder acronyms ("NRC", "IRAP", "COI"), which used to trip the
// acronym escape hatch below and sail straight into the catalog. Live
// discovery on 2026-07-04 inserted "COVID-19 Vaccination Policy", "National
// Asbestos Inventory", "Conflict of Interest guidance" and "Public Servants
// Disclosure Protection Act Compliance" as grants. Checked BEFORE any escape
// hatch. Phrases only — single ambiguous words would kill real programs.
const ADMIN_PAGE_PATTERNS: RegExp[] = [
  /\bpolicy$/i, // "...Vaccination Policy" (but not "Policy Innovation Fund")
  /\bpolic(y|ies)\b.*\b(covid|vaccination|privacy|travel)\b/i,
  /\b(covid|vaccination)\b/i,
  /\basbestos\b/i,
  /\bconflict of interest\b/i,
  /\bconflit d'int[eé]r[eê]ts?\b/i,
  /\bcode of conduct\b/i,
  /\bcode de conduite\b/i,
  /\bguidance on\b/i,
  /\bdisclosure protection\b/i,
  /\bact compliance\b/i,
  /\bprivacy (notice|statement)\b/i,
  /\baccessibility (statement|plan)\b/i,
  /\bterms of (use|service)\b/i,
  /\bconditions d'utilisation\b/i,
  /\bannual report\b/i,
  /\brapport annuel\b/i,
  /\binventory\b/i,
];

// Reject titles that are too generic to be real programs.
// E.g. "Funding", "Loans", "Programs and Initiatives", landing-page bait.
export function isGenericTitle(title: string): boolean {
  const raw = (title || "").trim();
  if (!raw) return true;
  // Administrative pages are rejected unconditionally — the acronym escape
  // hatch below must never rescue them.
  if (ADMIN_PAGE_PATTERNS.some((re) => re.test(raw))) return true;
  // Escape hatch: titles containing an acronym (3+ uppercase letters) or a roman/arabic
  // numeral suffix (e.g. "PSCe Volet 2", "IRAP", "SR&ED") are valid even when short.
  if (/[A-Z]{3,}/.test(raw)) return false;
  if (/\b(volet|phase|stream|program(me)?|fund|grant)\s+[0-9IVX]+\b/i.test(raw)) return false;
  const norm = normalizeTitle(raw);
  if (norm.length < 4) return true;
  const words = norm.split(/\s+/).filter(Boolean);
  // Require ≥2 meaningful words after stopword removal (was ≥3 — too strict).
  if (words.length < 2) return true;
  return false;
}

// Reject root-ish index URLs that aren't actual program pages.
// Paths like /financement, /prets, /programmes, /grants, /funding are
// listing pages that the Discoverer should NOT scrape as a single program.
const ROOT_INDEX_PATHS = new Set([
  "/financement",
  "/financements",
  "/funding",
  "/funds",
  "/fund",
  "/prets",
  "/prêts",
  "/loans",
  "/loan",
  "/subventions",
  "/subvention",
  "/grants",
  "/grant",
  "/programmes",
  "/programme",
  "/programs",
  "/program",
  "/aides",
  "/aide",
  "/credits",
  "/crédits",
  "/credit",
  "/crédit",
  "/scholarships",
  "/bourses",
  "/services",
  "/produits",
  "/products",
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
  } catch {
    return false;
  }
}

// Reject corporate / policy / governance pages by URL path. The LLM sometimes
// invents a clean-looking title for a page like
// nrc.canada.ca/en/corporate/values-ethics/policy-covid-19-vaccination, so the
// title filter misses it — but the path betrays it as non-grant. Derived from
// real noise observed in the discovered-grant backlog (values-ethics, asbestos
// inventory, planning reports, standards/certification, HR policy). Kept narrow
// so real program paths (support-technology-innovation, financement,
// soutien-linnovation, accompagnement) are never matched. EN + FR.
const NON_GRANT_URL_PATTERNS: RegExp[] = [
  /\/values?-ethics?\b/i,
  /\/valeurs-?(et-)?[ée]thique/i,
  /\/transparency\b/i,
  /\/transparence\b/i,
  /\/planification-rapports\b/i,
  /\/planning-reporting\b/i,
  /\/certifications?-[ée]valuations?-standards?\b/i,
  /\basbestos\b|\bamiante\b/i,
  /vaccinat/i,
  /wrongdoing|actes?-r[ée]pr[ée]hensibles?/i,
  /outside-employment|emploi.*ext[ée]rieur/i,
  /code-of-conduct|code-de-conduite/i,
  /national-inventory/i,
];
// Hosts that are never a funder's own program page — encyclopedias, social
// networks, aggregators. A grant lives on the funder's site, not Wikipedia.
// Observed: a /wiki/Industrial_Research_Assistance_Program page was ingested as
// an IRAP "grant". Matches the host and any subdomain (e.g. en.wikipedia.org).
const NON_GRANT_HOSTS = [
  "wikipedia.org",
  "wikimedia.org",
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "crunchbase.com",
  "reddit.com",
];
export function isNonGrantUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (NON_GRANT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
    // These first-party sections sell advice, loans, equity, training, or
    // explain adjudication. They are useful resources, but they are not grant
    // opportunities and must not enter the grant decision queue.
    if (host.endsWith("investquebec.com")) {
      if (/^\/fr\/accompagnement\//.test(path)) return true;
      if (/^\/fr\/financement\/(?:investissement|prets?)(?:\/|$)/.test(path)) return true;
    }
    if (host.endsWith("mitacs.ca")) {
      if (/^\/services\//.test(path)) return true;
      if (/eligible-research.*adjudication.*criteria/.test(path)) return true;
    }
    return NON_GRANT_URL_PATTERNS.some((re) => re.test(path));
  } catch {
    return false;
  }
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
  forceRefresh?: boolean;
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
  const { shouldFetch, recordFetch } = await import("@/lib/crawl-ledger.server");
  const { fetchCandidateLinksFromSitemaps } = await import("@/lib/site-candidates.server");

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
  const F = funder as {
    id: string;
    name: string;
    source_url: string;
    source_urls?: string[];
    source_type?: string;
  };

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
    // Last-resort seeding from the funder's own sitemaps so discovery stays
    // alive even when external search providers throttle or change policy.
    let sitemapSeedUsed = 0;
    if (mapped.size < 3) {
      try {
        const seeded = await fetchCandidateLinksFromSitemaps(F.source_url, {
          title: F.name,
          max: 20,
        });
        seeded.forEach((candidate) => mapped.add(candidate.url));
        sitemapSeedUsed = seeded.length;
      } catch {
        /* ignore */
      }
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
    const insertErrors: Array<{ title: string; error: string }> = [];
    const viaCounts = { firecrawl_json: 0, firecrawl: 0, jina_reader: 0, raw_html: 0 } as Record<
      string,
      number
    >;
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
                try {
                  r.url = new URL(r.url, url).href;
                } catch {
                  r.url = url;
                }
              } else {
                r.url = url;
              }
              const parsed = DiscoveredGrant.safeParse(r);
              if (parsed.success) pageGrants.push(parsed.data);
            }
          }
        } catch {
          /* fall through to LLM */
        }
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
          agent: "discoverer",
          runId,
          temperature: 0.1,
          responseFormat: "json",
          messages: [
            {
              role: "system",
              content:
                `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}\n` +
                `Extract every distinct Canadian funding program described on this page. ` +
                `If the page is an index listing multiple programs, return one entry per listed program. ` +
                `If nothing is a real program, return { "grants": [] }.`,
            },
            {
              role: "user",
              content:
                `Funder: ${F.name}\nPage URL: ${url}\nPage title: ${scrape.title ?? ""}\n\n` +
                `Markdown:\n${md}\n\n` +
                `Return JSON: { "grants": [ { "title", "title_fr"?, "summary"?, "summary_fr"?, ` +
                `"amount_cad_min"?, "amount_cad_max"?, "deadline"?, "eligibility"?, "sectors"?, ` +
                `"language", "url" } ] }`,
            },
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
        if (isGenericTitle(g.title) || isRootIndex(g.url || url) || isNonGrantUrl(g.url || url)) {
          continue; // structural filter: skip landing-page / index / non-grant policy pages
        }
        const ck = canonicalKey(F.id, g.title, F.name);
        const { data: existing } = await supabaseAdmin
          .from("grants")
          .select("id, times_seen")
          .eq("canonical_key", ck)
          .maybeSingle();
        if (existing) {
          await supabaseAdmin
            .from("grants")
            .update({
              last_seen_at: new Date().toISOString(),
              times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
            } as never)
            .eq("id", existing.id);
          seenAgain++;
          continue;
        }
        const sourceHash = createHash("sha256").update(`${g.url}|${g.title}`).digest("hex");
        const { error: ierr } = await supabaseAdmin.from("grants").insert({
          funder_id: F.id,
          title: g.title,
          title_fr: g.title_fr ?? null,
          summary: g.summary ?? null,
          summary_fr: g.summary_fr ?? null,
          // Discovery's LLM extraction has NO grounding check (unlike
          // enricher-steps.server.ts's snippetIsGrounded gate) — a
          // hallucinated dollar amount or deadline inserted here would
          // become a permanent "fact" the enricher's gap-fill never
          // revisits, since it only fills fields that are still null.
          // Always null here so enrichGrantImpl's grounded extraction is
          // the one and only source of truth for these two fields.
          amount_cad_min: null,
          amount_cad_max: null,
          deadline: null,
          eligibility: (g.eligibility ?? {}) as Record<string, unknown> as never,
          sectors: g.sectors ?? [],
          language: g.language,
          url: g.url || url,
          source_hash: sourceHash,
          canonical_key: ck,
          status: "discovered",
        });
        if (!ierr) {
          inserted++;
        } else if (/duplicate key/i.test(ierr.message)) {
          // Concurrent processOne calls (SCRAPE_CONCURRENCY) can both read
          // existing=null for the same program before either inserts —
          // that's a benign dedup race, not a real failure.
          seenAgain++;
        } else {
          insertErrors.push({ title: g.title, error: ierr.message });
        }
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
      run_id: runId,
      agent: "discoverer",
      status: "succeeded",
      model: "phi4-mini:latest",
      latency_ms: Date.now() - t0,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      metadata: {
        ...baseMeta,
        funder_id: F.id,
        funder_name: F.name,
        engine: "firecrawl_v2",
        urls_mapped: mapped.size,
        urls_scraped: candidates.length,
        urls_skipped: skipped,
        found: foundTotal,
        inserted,
        seen_again: seenAgain,
        insert_errors: insertErrors.slice(0, 5),
        seed_sitemap_used: sitemapSeedUsed,
        via_counts: viaCounts,
        per_page: perPageStats.slice(0, 12),
      },
    });
    return {
      ok: true,
      inserted,
      seenAgain,
      found: foundTotal,
      urlsMapped: mapped.size,
      urlsScraped: candidates.length,
      runId,
      engine: "firecrawl_v2",
    };
  }

  // ----- Path B: Fallback (no Firecrawl) — multi-page link-following crawl -----
  // Strategy: fetch the index, extract anchor links to same-host program-looking
  // sub-pages, scrape up to N of them in parallel, and let the LLM extract one
  // grant per page. This avoids the "nav-menu only" failure mode where the
  // index page yields generic titles like "Loans" / "Programs".

  async function fetchHtml(target: string, timeoutMs: number): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(target, {
        signal: ctrl.signal,
        headers: { "User-Agent": "IIAL/0.1 (+https://iial.ca)" },
      });
      if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
      return (await res.text()).slice(0, 350_000);
    } finally {
      clearTimeout(timer);
    }
  }
  function htmlToText(html: string, max = 30_000): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }
  const PROGRAM_HINTS =
    /(program|programme|fund(ing)?|grant|subvention|aide|prêt|pret|bourse|scholarship|prime|credit|crédit|incentive|loan)/i;
  // Negative patterns: obviously non-program pages we should never spend an LLM call on.
  const NON_PROGRAM =
    /(about|contact|press|news|blog|career|jobs|privacy|terms|legal|cookie|login|sign[-_]?in|sitemap|search|rss|feed|sponsor|commandite|salle[-_]de[-_]presse|nous[-_]joindre|tout[-_]sur[-_]nous|qui[-_]sommes|esg|publication|rapport|annual[-_]report|events?|evenements?|webinair|partners?|partenaires)/i;
  function extractCandidateLinks(
    html: string,
    baseUrl: string,
  ): Array<{ url: string; text: string; score: number }> {
    const base = new URL(baseUrl);
    const found = new Map<string, { text: string; score: number }>();
    const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const href = m[1];
      const rawText = m[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!rawText || rawText.length < 5 || rawText.length > 160) continue;
      let abs: URL;
      try {
        abs = new URL(href, baseUrl);
      } catch {
        continue;
      }
      if (abs.host !== base.host) continue;
      if (!/^https?:$/.test(abs.protocol)) continue;
      const path = abs.pathname.replace(/\/+$/, "").toLowerCase();
      if (!path || path === "/") continue;
      if (path === base.pathname.replace(/\/+$/, "").toLowerCase()) continue;
      if (NON_PROGRAM.test(`${path} ${rawText}`)) continue;
      const segs = path.split("/").filter(Boolean);
      // Score: program hints in path/text + depth.
      let score = 0;
      if (PROGRAM_HINTS.test(path)) score += 3;
      if (PROGRAM_HINTS.test(rawText)) score += 2;
      score += Math.min(segs.length, 4);
      // Require at least one positive signal.
      if (score < 2) continue;
      const key = `${abs.origin}${abs.pathname}`;
      const prev = found.get(key);
      if (!prev || prev.score < score) found.set(key, { text: rawText, score });
    }
    return Array.from(found, ([url, v]) => ({ url, text: v.text, score: v.score })).sort(
      (a, b) => b.score - a.score,
    );
  }

  let indexHtml = "";
  let indexFetchError: string | null = null;
  try {
    indexHtml = await fetchHtml(F.source_url, 10_000);
  } catch (e) {
    indexFetchError = e instanceof Error ? e.message : String(e);
  }
  const indexText = htmlToText(indexHtml, 8_000);
  const linksFromIndex = indexHtml ? extractCandidateLinks(indexHtml, F.source_url) : [];

  // Seed extra candidates via Jina Search so we never depend on the funder's
  // own navigation surfacing every program. This makes discovery resilient on
  // sites that hide programs behind JS menus, filters, or pagination.
  const seedHost = new URL(F.source_url).host;
  const seeded: Array<{ url: string; text: string; score: number }> = [];
  const searchSeeds: Array<{ query: string; ok: boolean; hits: number; error?: string }> = [];
  try {
    const queries = [
      `site:${seedHost} (program OR funding OR grant OR subvention OR financement OR prêt)`,
      `site:${seedHost} eligibility deadline application`,
    ];
    for (const q of queries) {
      const r = await jinaSearch(q, 15);
      searchSeeds.push({
        query: q,
        ok: r.ok,
        hits: r.ok ? r.hits.length : 0,
        error: r.ok ? undefined : r.error,
      });
      if (!r.ok) continue;
      for (const h of r.hits) {
        try {
          const u = new URL(h.url);
          if (u.host !== seedHost) continue;
          if (NON_PROGRAM.test(u.pathname)) continue;
          seeded.push({ url: `${u.origin}${u.pathname}`, text: h.title || u.pathname, score: 4 });
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* Jina best-effort */
  }

  const sitemapSeeded = await fetchCandidateLinksFromSitemaps(F.source_url, {
    title: F.name,
    max: FALLBACK_MAX_LINKS,
  }).catch(() => []);

  // Merge index + seeded, dedupe by URL, keep best score, cap at FALLBACK_MAX_LINKS.
  const merged = new Map<string, { url: string; text: string; score: number }>();
  for (const l of [...linksFromIndex, ...seeded, ...sitemapSeeded]) {
    const prev = merged.get(l.url);
    if (!prev || prev.score < l.score) merged.set(l.url, l);
  }
  const links = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, FALLBACK_MAX_LINKS);

  if (links.length === 0 && indexText.length < 200) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId,
      agent: "discoverer",
      status: "degraded",
      model: "phi4-mini:latest",
      latency_ms: Date.now() - t0,
      error: "page_too_short",
      metadata: {
        ...baseMeta,
        funder_id: F.id,
        funder_name: F.name,
        engine: "fallback",
        index_fetch_error: indexFetchError,
        links_considered: 0,
      },
    });
    return {
      ok: true,
      inserted: 0,
      runId,
      degraded: true,
      engine: "fallback",
      error: "page_too_short",
    };
  }

  // Scrape candidate pages in parallel (bounded) using the local engine chain.
  // The crawl ledger skips URLs whose `next_fetch_at` hasn't elapsed and records
  // the outcome so future runs honour Nutch-style adaptive cadence.
  type PageDoc = { url: string; text: string };
  const pageDocs: PageDoc[] = [];
  let ledgerSkipped = 0;
  let ledgerFreshHits = 0;
  const pageFetchFailures: Array<{ url: string; reason: string }> = [];
  const pageSkipReasons: Record<string, number> = {};
  for (let i = 0; i < links.length; i += SCRAPE_CONCURRENCY) {
    const batch = links.slice(i, i + SCRAPE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (l) => {
        const decision = opts.forceRefresh
          ? { fetch: true as const, etag: undefined, lastModified: undefined }
          : await shouldFetch(l.url);
        if (!decision.fetch)
          return { url: l.url, text: "", skipped: true, reason: decision.reason };
        const scrape = await scrapeWithFallback(l.url, {
          etag: decision.etag,
          lastModified: decision.lastModified,
        });
        if (!scrape.ok) {
          await recordFetch(l.url, { kind: "error", reason: scrape.error }, { funderId: F.id });
          return { url: l.url, text: "", skipped: false, reason: scrape.error };
        }
        const out = await recordFetch(
          l.url,
          {
            kind: "ok",
            markdown: scrape.markdown,
            title: scrape.title,
            via: scrape.via,
            bytes: scrape.markdown.length,
          },
          { funderId: F.id },
        );
        return {
          url: l.url,
          text: scrape.markdown.slice(0, 5_000),
          skipped: false,
          changed: out.changed,
        };
      }),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      if (r.value.skipped) {
        ledgerSkipped++;
        const reason = r.value.reason ?? "skipped";
        pageSkipReasons[reason] = (pageSkipReasons[reason] ?? 0) + 1;
        continue;
      }
      if (r.value.text.length >= 400) {
        pageDocs.push({ url: r.value.url, text: r.value.text });
        ledgerFreshHits++;
      } else {
        const reason = r.value.reason ?? "too_short_after_fetch";
        pageFetchFailures.push({ url: r.value.url, reason });
        pageSkipReasons[reason] = (pageSkipReasons[reason] ?? 0) + 1;
      }
    }
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  if (pageDocs.length === 0) {
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId,
      agent: "discoverer",
      status: "degraded",
      model: "phi4-mini:latest",
      input_tokens: null,
      output_tokens: null,
      latency_ms: Date.now() - t0,
      error: "no_candidate_pages_scraped",
      metadata: {
        ...baseMeta,
        funder_id: F.id,
        funder_name: F.name,
        engine: "fallback",
        index_fetch_error: indexFetchError,
        links_from_index: linksFromIndex.length,
        links_from_search: seeded.length,
        links_from_sitemap: sitemapSeeded.length,
        links_extracted: links.length,
        pages_scraped: 0,
        ledger_skipped: ledgerSkipped,
        ledger_fresh_hits: ledgerFreshHits,
        search_seeds: searchSeeds,
        page_skip_reasons: pageSkipReasons,
        page_fetch_failures: pageFetchFailures.slice(0, 10),
        found: 0,
        inserted: 0,
        seen_again: 0,
      },
    });
    return {
      ok: true,
      inserted: 0,
      seenAgain: 0,
      found: 0,
      urlsScraped: 0,
      runId,
      degraded: true,
      engine: "fallback",
      error: "no_candidate_pages_scraped",
    };
  }

  let inserted = 0;
  let seenAgain = 0;
  let foundTotal = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const skipReasons: Record<string, number> = {};
  const skippedSamples: Array<{ title: string; url: string; reason: string }> = [];
  const insertErrors: Array<{ title: string; error: string }> = [];
  const perPage: Array<{ url: string; found: number; inserted: number; reason?: string }> = [];

  // Ask LLM to extract ONE grant per program page (sequential + throttle to respect free-tier rate limits).
  for (let pi = 0; pi < pageDocs.length; pi++) {
    const doc = pageDocs[pi];
    if (pi > 0) await sleep(FALLBACK_LLM_THROTTLE_MS);
    let pageGrants: z.infer<typeof DiscoveredGrant>[] = [];

    try {
      const llmPage = await callLlm({
        agent: "discoverer",
        runId,
        temperature: 0.1,
        responseFormat: "json",
        messages: [
          {
            role: "system",
            content: `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}`,
          },
          {
            role: "user",
            content:
              `Funder: ${F.name}\nProgram page URL: ${doc.url}\n\nPage text:\n${doc.text}\n\n` +
              `Return JSON: { "grants": [ one entry describing THIS specific program with fields: ` +
              `"title", "title_fr"?, "summary"?, "summary_fr"?, "amount_cad_min"?, "amount_cad_max"?, ` +
              `"deadline"?, "eligibility"?, "sectors"?, "language", "url" ] }. Use "${doc.url}" as the url. ` +
              `LANGUAGE RULE (CRITICAL): "title" and "summary" MUST always be in ENGLISH. ` +
              `If the source page is in French, translate them to natural English and put the ORIGINAL French ` +
              `text in "title_fr" and "summary_fr". Set "language" to the source page language ("en" or "fr"). ` +
              `Do not leave French strings in "title" or "summary". Translate "eligibility" values and "sectors" to English as well. ` +
              `If the page is not a specific funding program, return { "grants": [] }.`,
          },
        ],
      });
      inputTokens += llmPage.inputTokens ?? 0;
      outputTokens += llmPage.outputTokens ?? 0;
      const parsedPage = MultiPageOutput.parse(JSON.parse(llmPage.text));
      pageGrants = parsedPage.grants;
    } catch {
      perPage.push({ url: doc.url, found: 0, inserted: 0, reason: "schema_validation" });
      continue;
    }

    // Defensive translation: if the LLM left French in title/summary, translate now.
    const FRENCH_HINT =
      /\b(le|la|les|des|du|aux?|pour|avec|sans|sur|programme|subvention|prêt|prets?|aide|crédit|entreprises?|québec|développement|investissement|formation|d['’]|l['’]|qu['’])\b/i;
    function looksFrench(s: string | null | undefined): boolean {
      if (!s) return false;
      const hits = (s.match(FRENCH_HINT) ?? []).length;
      return hits >= 2 || (/[àâçéèêëîïôûùœ]/.test(s) && hits >= 1);
    }
    for (const g of pageGrants) {
      if (!looksFrench(g.title) && !looksFrench(g.summary)) continue;
      try {
        const tr = await callLlm({
          agent: "discoverer",
          runId,
          temperature: 0,
          responseFormat: "json",
          messages: [
            {
              role: "system",
              content:
                "You translate Canadian funding-program text from French to natural English. Return ONLY JSON.",
            },
            {
              role: "user",
              content:
                `Translate to English. Keep proper nouns (program names, agencies) intact. ` +
                `Return JSON: {"title_en": string, "summary_en": string}\n\n` +
                `title: ${g.title}\nsummary: ${g.summary ?? ""}`,
            },
          ],
        });
        inputTokens += tr.inputTokens ?? 0;
        outputTokens += tr.outputTokens ?? 0;
        const parsed = JSON.parse(tr.text) as { title_en?: string; summary_en?: string };
        if (parsed.title_en && looksFrench(g.title)) {
          if (!g.title_fr) g.title_fr = g.title;
          g.title = parsed.title_en;
        }
        if (parsed.summary_en && looksFrench(g.summary)) {
          if (!g.summary_fr) g.summary_fr = g.summary ?? null;
          g.summary = parsed.summary_en;
        }
        await sleep(FALLBACK_LLM_THROTTLE_MS);
      } catch {
        /* keep original on failure */
      }
    }

    let pageInserted = 0;
    foundTotal += pageGrants.length;

    for (const g of pageGrants) {
      if (isGenericTitle(g.title)) {
        skipReasons.generic_title = (skipReasons.generic_title ?? 0) + 1;
        if (skippedSamples.length < 5)
          skippedSamples.push({ title: g.title, url: g.url || doc.url, reason: "generic_title" });
        continue;
      }
      // Force page URL when the LLM omits it or returns the index URL.
      const effectiveUrl = g.url && g.url !== F.source_url ? g.url : doc.url;
      if (isRootIndex(effectiveUrl) || isNonGrantUrl(effectiveUrl)) {
        const reason = isNonGrantUrl(effectiveUrl) ? "non_grant_url" : "root_index";
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        if (skippedSamples.length < 5)
          skippedSamples.push({ title: g.title, url: effectiveUrl, reason });
        continue;
      }
      const ck = canonicalKey(F.id, g.title, F.name);
      const sourceHash = createHash("sha256")
        .update(`${g.url && g.url !== F.source_url ? g.url : doc.url}|${g.title}`)
        .digest("hex");
      // Look up existing by canonical_key OR source_hash to absorb retries/dupes.
      const { data: existing } = await supabaseAdmin
        .from("grants")
        .select("id, times_seen")
        .or(`canonical_key.eq.${ck},source_hash.eq.${sourceHash}`)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("grants")
          .update({
            last_seen_at: new Date().toISOString(),
            times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
          } as never)
          .eq("id", existing.id);
        seenAgain++;
        continue;
      }
      const effectiveUrl2 = g.url && g.url !== F.source_url ? g.url : doc.url;
      const { error: ierr } = await supabaseAdmin.from("grants").insert({
        funder_id: F.id,
        title: g.title,
        title_fr: g.title_fr ?? null,
        summary: g.summary ?? null,
        summary_fr: g.summary_fr ?? null,
        // See Path A's identical comment: no grounding check exists at
        // discovery time, so amount/deadline must always come from the
        // enricher's grounded extraction, never from Discovery's raw LLM
        // guess.
        amount_cad_min: null,
        amount_cad_max: null,
        deadline: null,
        eligibility: (g.eligibility ?? {}) as Record<string, unknown> as never,
        sectors: g.sectors ?? [],
        language: g.language,
        url: effectiveUrl2,
        source_hash: sourceHash,
        canonical_key: ck,
        status: "discovered",
      });
      if (!ierr) {
        inserted++;
        pageInserted++;
      } else if (/duplicate key/i.test(ierr.message)) {
        seenAgain++;
      } else {
        insertErrors.push({ title: g.title, error: ierr.message });
      }
    }
    perPage.push({ url: doc.url, found: pageGrants.length, inserted: pageInserted });
  }

  await supabaseAdmin
    .from("funders")
    .update({ last_discovered_at: new Date().toISOString() } as never)
    .eq("id", F.id);

  await supabaseAdmin.from("agent_runs").insert({
    run_id: runId,
    agent: "discoverer",
    status: "succeeded",
    model: "phi4-mini:latest",
    input_tokens: inputTokens || null,
    output_tokens: outputTokens || null,
    latency_ms: Date.now() - t0,
    metadata: {
      ...baseMeta,
      funder_id: F.id,
      funder_name: F.name,
      engine: "fallback",
      index_fetch_error: indexFetchError,
      links_extracted: links.length,
      pages_scraped: pageDocs.length,
      links_from_index: linksFromIndex.length,
      links_from_search: seeded.length,
      links_from_sitemap: sitemapSeeded.length,
      ledger_skipped: ledgerSkipped,
      ledger_fresh_hits: ledgerFreshHits,
      search_seeds: searchSeeds,
      page_skip_reasons: pageSkipReasons,
      page_fetch_failures: pageFetchFailures.slice(0, 10),
      found: foundTotal,
      inserted,
      seen_again: seenAgain,
      skip_reasons: skipReasons,
      skipped_samples: skippedSamples,
      insert_errors: insertErrors.slice(0, 5),
      per_page: perPage.slice(0, 15),
    },
  });
  return {
    ok: true,
    inserted,
    seenAgain,
    found: foundTotal,
    urlsScraped: pageDocs.length,
    runId,
    engine: "fallback",
  };
}
