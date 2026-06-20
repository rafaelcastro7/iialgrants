// Server-only fallback chain for web fetching used by the Discoverer.
// Order: Firecrawl (rich, structured) → Jina Reader (free, markdown) → raw fetch.
// All helpers are free except Firecrawl; Jina has no API key for the Reader/Search
// endpoints (free tier is rate-limited but unauthenticated).
//
// Public surface:
//   - jinaReader(url): clean markdown of any URL, no API key required.
//   - jinaSearch(query, limit): LLM-ready search results with snippets.
//   - scrapeWithFallback(url, opts): tries Firecrawl, then Jina, then raw HTML.
//   - searchWeb(query, limit): tries Jina search first; returns [] on failure.

import { firecrawlAvailable, firecrawlScrape } from "@/lib/firecrawl.server";

export type FetchVia = "firecrawl_json" | "firecrawl" | "jina_reader" | "raw_html";

export type FetchedPage =
  | { ok: true; url: string; markdown: string; title?: string; json?: unknown; via: FetchVia }
  | { ok: false; url: string; error: string; via: FetchVia | "none" };

const JINA_READER_BASE = "https://r.jina.ai/";
const JINA_SEARCH_BASE = "https://s.jina.ai/";

function jinaHeaders(): HeadersInit {
  // Jina free tier works without an API key; if user adds JINA_API_KEY as a
  // secret later we'll attach it for higher rate limits automatically.
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
    const res = await fetch(`${JINA_READER_BASE}${url}`, {
      headers: jinaHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, url, error: `jina_reader_${res.status}`, via: "jina_reader" };
    const data = (await res.json()) as {
      data?: { content?: string; title?: string; url?: string };
    };
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
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000);
    if (markdown.length < 200) return { ok: false, url, error: "raw_too_short", via: "raw_html" };
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return { ok: true, url, markdown, title: titleMatch?.[1]?.trim(), via: "raw_html" };
  } catch (e) {
    return { ok: false, url, error: e instanceof Error ? e.message : String(e), via: "raw_html" };
  } finally { clearTimeout(t); }
}

// Chain: Firecrawl (structured) → Jina Reader (free markdown) → raw HTML.
// Returns whichever succeeds first with `via` indicating the source.
export async function scrapeWithFallback(
  url: string,
  opts: { jsonSchema?: object; jsonPrompt?: string; skipFirecrawl?: boolean } = {},
): Promise<FetchedPage> {
  if (!opts.skipFirecrawl && firecrawlAvailable()) {
    const r = await firecrawlScrape(url, { jsonSchema: opts.jsonSchema, jsonPrompt: opts.jsonPrompt });
    if (r.ok) {
      return {
        ok: true, url: r.url, markdown: r.markdown, title: r.title, json: r.json,
        via: r.json ? "firecrawl_json" : "firecrawl",
      };
    }
    // Only fall through on transient errors (credit/rate/timeout/empty),
    // not on validation errors.
    if (!/scrape_(402|408|429|5\d\d)|empty_response|timeout/i.test(r.error)) {
      // Hard failure: still try Jina because it sometimes parses what Firecrawl can't.
    }
  }
  const jr = await jinaReader(url);
  if (jr.ok) return jr;
  const raw = await rawHtmlFetch(url);
  if (raw.ok) return raw;
  return { ok: false, url, error: `all_engines_failed: ${jr.error} | ${raw.error}`, via: "none" };
}

export async function searchWeb(query: string, limit = 10): Promise<SearchHit[]> {
  const r = await jinaSearch(query, limit);
  return r.ok ? r.hits : [];
}
