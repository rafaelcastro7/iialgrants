// Server-only Firecrawl helper. Used by Discovery v2 to map index pages,
// then batch-scrape candidate program URLs to clean markdown.
// Falls back to undefined when FIRECRAWL_API_KEY is missing, so callers can
// degrade to plain fetch + HTML strip.

type MapResult = { ok: true; links: string[] } | { ok: false; error: string };
type ScrapeResult =
  | { ok: true; url: string; markdown: string; title?: string; json?: unknown }
  | { ok: false; url: string; error: string };

const BASE = "https://api.firecrawl.dev/v2";

function getKey(): string | undefined {
  return process.env.FIRECRAWL_API_KEY?.trim() || undefined;
}

export function firecrawlAvailable(): boolean {
  return Boolean(getKey());
}

// Map a site with optional keyword focus (Firecrawl ranks links by relevance
// when `search` is provided — great for narrowing thousand-link sitemaps to
// program-style URLs).
export async function firecrawlMap(
  url: string,
  limit = 100,
  search?: string,
): Promise<MapResult> {
  const key = getKey();
  if (!key) return { ok: false, error: "no_api_key" };
  try {
    const res = await fetch(`${BASE}/map`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, limit, includeSubdomains: false, ...(search ? { search } : {}) }),
    });
    if (!res.ok) return { ok: false, error: `map_${res.status}` };
    const json = (await res.json()) as { links?: Array<string | { url: string }>; data?: { links?: Array<string | { url: string }> } };
    const raw = json.links ?? json.data?.links ?? [];
    const links = raw
      .map((l) => (typeof l === "string" ? l : l?.url))
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    return { ok: true, links };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Scrape a page. If `jsonSchema` is provided, also request Firecrawl's JSON
// extraction (LLM-on-server) so callers can skip a second LLM round trip.
export async function firecrawlScrape(
  url: string,
  opts: { jsonSchema?: object; jsonPrompt?: string } = {},
): Promise<ScrapeResult> {
  const key = getKey();
  if (!key) return { ok: false, url, error: "no_api_key" };
  try {
    const formats: unknown[] = ["markdown"];
    if (opts.jsonSchema || opts.jsonPrompt) {
      formats.push({
        type: "json",
        ...(opts.jsonSchema ? { schema: opts.jsonSchema } : {}),
        ...(opts.jsonPrompt ? { prompt: opts.jsonPrompt } : {}),
      });
    }
    const res = await fetch(`${BASE}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats, onlyMainContent: true, timeout: 25000 }),
    });
    if (!res.ok) return { ok: false, url, error: `scrape_${res.status}` };
    const json = (await res.json()) as {
      data?: { markdown?: string; metadata?: { title?: string }; json?: unknown };
      markdown?: string;
      metadata?: { title?: string };
      json?: unknown;
    };
    const markdown = json.data?.markdown ?? json.markdown ?? "";
    const title = json.data?.metadata?.title ?? json.metadata?.title;
    const jsonOut = json.data?.json ?? json.json;
    if (!markdown && !jsonOut) return { ok: false, url, error: "empty_response" };
    return { ok: true, url, markdown, title, json: jsonOut };
  } catch (e) {
    return { ok: false, url, error: e instanceof Error ? e.message : String(e) };
  }
}

// Heuristic: filter out URLs unlikely to be funding program pages.
const SKIP_PATTERNS = [
  /\/news\b/i, /\/blog\b/i, /\/events?\b/i, /\/contact\b/i, /\/about\b/i,
  /\/login\b/i, /\/account\b/i, /\/search\b/i, /\/sitemap/i, /\/feed\b/i,
  /\.(pdf|zip|docx?|xlsx?|csv|jpg|jpeg|png|gif|svg)(\?|$)/i,
  /\/(careers?|jobs?|press|media|privacy|terms|cookies?)\b/i,
];
const KEEP_PATTERNS = [
  /program/i, /financ/i, /fund/i, /subsid/i, /grant/i, /tax-credit/i,
  /innovation/i, /support/i, /scholarship/i, /credit/i, /loan/i, /produit/i,
  /programme/i, /subvention/i, /bourse/i, /aide/i, /cr[eé]dit/i, /incit/i,
  /pret/i, /pr[eê]t/i, /investiss/i,
];

export function filterProgramUrls(links: string[], origin: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of links) {
    let u: URL;
    try { u = new URL(raw, origin); } catch { continue; }
    if (!u.href.startsWith("http")) continue;
    const key = u.origin + u.pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    if (SKIP_PATTERNS.some((re) => re.test(u.pathname))) continue;
    // Prefer URLs that look like program pages; allow root-ish too.
    const looksLikeProgram = KEEP_PATTERNS.some((re) => re.test(u.pathname));
    const isShallow = u.pathname.split("/").filter(Boolean).length <= 4;
    if (!looksLikeProgram && !isShallow) continue;
    out.push(u.href);
  }
  return out;
}
