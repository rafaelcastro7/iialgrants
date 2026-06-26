// Server-only fallback chain for web fetching used by the Discoverer.
//
// Order (default — zero external API costs):
//   1. scrapeEngine      — our own Readability + linkedom + turndown pipeline
//   2. jinaReader        — free remote markdownifier (handles JS-rendered SPAs)
//   3. rawHtml           — last-resort tag-stripped fetch
//
// Firecrawl is OFF by default. Set USE_FIRECRAWL=1 + FIRECRAWL_API_KEY to
// re-enable it (e.g. for sites the local engine + Jina can't crack).
//
// Public surface:
//   - jinaReader(url)
//   - jinaSearch(query, limit)
//   - scrapeWithFallback(url, opts)  — runs the chain, returns first success
//   - searchWeb(query, limit)

import { firecrawlAvailable, firecrawlScrape } from "@/lib/firecrawl.server";
import { scrapeEngineFetch } from "@/lib/scrape-engine.server";

export type FetchVia =
  | "scrape_engine"
  | "firecrawl_json"
  | "firecrawl"
  | "jina_reader"
  | "raw_html";

export type FetchedPage =
  | { ok: true; url: string; markdown: string; title?: string; json?: unknown; via: FetchVia }
  | { ok: false; url: string; error: string; via: FetchVia | "none" };

const JINA_READER_BASE = "https://r.jina.ai/";
const JINA_SEARCH_BASE = "https://s.jina.ai/";

function firecrawlEnabled(): boolean {
  return process.env.USE_FIRECRAWL === "1" && firecrawlAvailable();
}

function jinaHeaders(): HeadersInit {
  const key = process.env.JINA_API_KEY?.trim();
  const h: Record<string, string> = {
    Accept: "application/json",
    "X-With-Generated-Alt": "true",
  };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

export async function jinaReader(url: string, timeoutMs = 20_000): Promise<FetchedPage> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${JINA_READER_BASE}${url}`, { headers: jinaHeaders(), signal: ctrl.signal });
    if (!res.ok) return { ok: false, url, error: `jina_reader_${res.status}`, via: "jina_reader" };
    const data = (await res.json()) as { data?: { content?: string; title?: string; url?: string } };
    const markdown = data.data?.content ?? "";
    const title = data.data?.title;
    if (markdown.length < 100) return { ok: false, url, error: "jina_reader_empty", via: "jina_reader" };
    return { ok: true, url, markdown, title, via: "jina_reader" };
  } catch (e) {
    return { ok: false, url, error: e instanceof Error ? e.message : String(e), via: "jina_reader" };
  } finally { clearTimeout(t); }
}

export type SearchHit = { url: string; title: string; snippet: string };

export async function jinaSearch(query: string, limit = 10, timeoutMs = 15_000): Promise<{ ok: true; hits: SearchHit[] } | { ok: false; error: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${JINA_SEARCH_BASE}${encodeURIComponent(query)}`, {
      headers: { ...jinaHeaders(), "X-Respond-With": "no-content" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `jina_search_${res.status}` };
    const data = (await res.json()) as { data?: Array<{ url?: string; title?: string; description?: string; content?: string }> };
    const hits = (data.data ?? []).slice(0, limit).map((d) => ({
      url: String(d.url ?? ""),
      title: String(d.title ?? ""),
      snippet: String(d.description ?? d.content ?? "").slice(0, 500),
    })).filter((h) => h.url.startsWith("http"));
    return { ok: true, hits };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally { clearTimeout(t); }
}

async function rawHtmlFetch(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "IIAL/0.1 (+https://iial.ca)" },
    });
    if (!res.ok) return { ok: false, url, error: `raw_fetch_${res.status}`, via: "raw_html" };
    const html = (await res.text()).slice(0, 250_000);
    const markdown = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ").trim().slice(0, 30_000);
    if (markdown.length < 200) return { ok: false, url, error: "raw_too_short", via: "raw_html" };
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return { ok: true, url, markdown, title: titleMatch?.[1]?.trim(), via: "raw_html" };
  } catch (e) {
    return { ok: false, url, error: e instanceof Error ? e.message : String(e), via: "raw_html" };
  } finally { clearTimeout(t); }
}

// Default chain: our scrape engine first (free, local, no API quota), then
// Jina Reader (free remote, handles JS), then raw HTML, then Firecrawl only
// if explicitly opted-in via USE_FIRECRAWL=1.
export async function scrapeWithFallback(
  url: string,
  opts: { jsonSchema?: object; jsonPrompt?: string; etag?: string; lastModified?: string; skipFirecrawl?: boolean } = {},
): Promise<FetchedPage> {
  // 1. Local engine
  const eng = await scrapeEngineFetch(url, { etag: opts.etag, lastModified: opts.lastModified });
  if (eng.ok) {
    return { ok: true, url: eng.url, markdown: eng.markdown, title: eng.title, via: "scrape_engine" };
  }
  if (eng.gone || eng.blocked || eng.notModified) {
    // Stop the chain — these are definitive answers, not transient failures.
    return { ok: false, url, error: eng.error, via: "scrape_engine" };
  }

  // 2. Jina Reader (free remote; handles JS-rendered pages)
  const jr = await jinaReader(url);
  if (jr.ok) return jr;

  // 3. Raw HTML
  const raw = await rawHtmlFetch(url);
  if (raw.ok) return raw;

  // 4. Optional Firecrawl (only if user opts in)
  if (!opts.skipFirecrawl && firecrawlEnabled()) {
    const fc = await firecrawlScrape(url, { jsonSchema: opts.jsonSchema, jsonPrompt: opts.jsonPrompt });
    if (fc.ok) {
      return {
        ok: true, url: fc.url, markdown: fc.markdown, title: fc.title, json: fc.json,
        via: fc.json ? "firecrawl_json" : "firecrawl",
      };
    }
  }

  return { ok: false, url, error: `all_engines_failed: ${eng.error} | ${jr.error} | ${raw.error}`, via: "none" };
}

export async function searchWeb(query: string, limit = 10): Promise<SearchHit[]> {
  const r = await jinaSearch(query, limit);
  return r.ok ? r.hits : [];
}
