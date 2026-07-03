// Server-only fallback chain for web fetching used by the Discoverer and
// Enricher. Returns a single FetchedPage plus a structured `attempts[]`
// trail (engine, HTTP status, latency, error) so the UI can show exactly
// which engines ran and why each failed.
//
// Engine order (free, zero external-API cost by default):
//   1. scrapeEngine    — local Readability + linkedom + turndown
//   2. jinaReader      — free remote markdownifier (handles JS-rendered SPAs)
//   3. rawHtml(chrome) — last-resort tag-stripped fetch with desktop UA
//   4. rawHtml(google) — same, but Googlebot UA (many gov sites whitelist it)
//   5. wayback         — Internet Archive snapshot (geo/bot-block bypass)
//   6. archiveToday    — archive.ph snapshot (different infra than Wayback)
//   7. firecrawl       — only if USE_FIRECRAWL=1 + FIRECRAWL_API_KEY
//
// Public surface:
//   - jinaReader(url)
//   - jinaSearch(query, limit)
//   - scrapeWithFallback(url, opts)
//   - searchWeb(query, limit)

import { firecrawlAvailable, firecrawlScrape } from "@/lib/firecrawl.server";
import { scrapeEngineFetch } from "@/lib/scrape-engine.server";

export type FetchVia =
  | "scrape_engine"
  | "firecrawl_json"
  | "firecrawl"
  | "jina_reader"
  | "raw_html"
  | "raw_html_googlebot"
  | "wayback"
  | "archive_today";

export type FetchAttempt = {
  engine: FetchVia;
  ok: boolean;
  http_status?: number;          // when the engine actually hit HTTP
  latency_ms: number;
  error?: string;                // short reason
  url_used?: string;             // resolved/snapshot URL when different
  bytes?: number;                // markdown char count on success
  ts: string;                    // ISO timestamp
};

export type FetchedPage =
  | { ok: true; url: string; markdown: string; title?: string; json?: unknown; via: FetchVia; attempts: FetchAttempt[] }
  | { ok: false; url: string; error: string; via: FetchVia | "none"; attempts: FetchAttempt[] };

const JINA_READER_BASE = "https://r.jina.ai/";
const JINA_SEARCH_BASE = "https://s.jina.ai/";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function firecrawlEnabled(): boolean {
  return process.env.USE_FIRECRAWL === "1" && firecrawlAvailable();
}

function jinaHeaders(): HeadersInit {
  const key = process.env.JINA_API_KEY?.trim();
  const h: Record<string, string> = { Accept: "application/json" };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

function htmlToMarkdown(html: string, max = 40_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
}

function titleFromHtml(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim();
}

// ---------------------------------------------------------------------------
// Shared engine runner: encapsulates AbortController + timeout + cleanup and
// normalizes success/failure/thrown-error into the { page, attempt } contract
// every engine returns. Engines report per-branch metadata (http_status,
// url_used) through the mutable `ctx`.
// ---------------------------------------------------------------------------

type EngineCtx = { httpStatus?: number; urlUsed?: string };

type EngineOutcome =
  | { ok: true; markdown: string; title?: string }
  | { ok: false; error: string; bytes?: number };

async function runEngine(
  engine: FetchVia,
  url: string,
  timeoutMs: number,
  fn: (signal: AbortSignal, ctx: EngineCtx) => Promise<EngineOutcome>,
): Promise<{ page: FetchedPage; attempt: FetchAttempt }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  const ctx: EngineCtx = {};
  const finish = (r: EngineOutcome): { page: FetchedPage; attempt: FetchAttempt } => {
    const attempt: FetchAttempt = {
      engine,
      ok: r.ok,
      http_status: ctx.httpStatus,
      latency_ms: Date.now() - t0,
      error: r.ok ? undefined : r.error,
      url_used: ctx.urlUsed,
      bytes: r.ok ? r.markdown.length : r.bytes,
      ts: new Date().toISOString(),
    };
    const page: FetchedPage = r.ok
      ? { ok: true, url, markdown: r.markdown, title: r.title, via: engine, attempts: [attempt] }
      : { ok: false, url, error: r.error, via: engine, attempts: [attempt] };
    return { page, attempt };
  };
  try {
    return finish(await fn(ctrl.signal, ctx));
  } catch (e) {
    return finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally { clearTimeout(t); }
}

export async function jinaReader(
  url: string,
  timeoutMs = 20_000,
  minChars = 100,
): Promise<{ page: FetchedPage; attempt: FetchAttempt }> {
  return runEngine("jina_reader", url, timeoutMs, async (signal, ctx) => {
    let res = await fetch(`${JINA_READER_BASE}${url}`, { headers: jinaHeaders(), signal });
    ctx.httpStatus = res.status;
    if (res.status === 401 || res.status === 402) {
      const plainHeaders: Record<string, string> = {};
      const key = process.env.JINA_API_KEY?.trim();
      if (key) plainHeaders.Authorization = `Bearer ${key}`;
      res = await fetch(`${JINA_READER_BASE}${url}`, { headers: plainHeaders, signal });
      ctx.httpStatus = res.status;
    }
    if (!res.ok) return { ok: false, error: `jina_reader_${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    let markdown = "";
    let title: string | undefined;
    if (ct.includes("application/json")) {
      const data = (await res.json()) as { data?: { content?: string; title?: string } };
      markdown = data.data?.content ?? "";
      title = data.data?.title;
    } else {
      markdown = await res.text();
      const m = markdown.match(/^Title:\s*(.+)$/m);
      if (m) title = m[1].trim();
    }
    if (markdown.length < minChars) return { ok: false, error: "jina_reader_empty", bytes: markdown.length };
    return { ok: true, markdown, title };
  });
}

async function rawFetch(
  url: string,
  ua: string,
  engine: "raw_html" | "raw_html_googlebot",
  timeoutMs = 10_000,
  minChars = 200,
): Promise<{ page: FetchedPage; attempt: FetchAttempt }> {
  return runEngine(engine, url, timeoutMs, async (signal, ctx) => {
    const res = await fetch(url, {
      signal,
      redirect: "follow",
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.5",
        Referer: "https://www.google.com/",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
      },
    });
    ctx.httpStatus = res.status;
    if (!res.ok) return { ok: false, error: `${engine}_${res.status}` };
    const html = (await res.text()).slice(0, 400_000);
    const markdown = htmlToMarkdown(html, 30_000);
    if (markdown.length < minChars) return { ok: false, error: `${engine}_too_short`, bytes: markdown.length };
    return { ok: true, markdown, title: titleFromHtml(html) };
  });
}

async function waybackFetch(
  url: string,
  timeoutMs = 18_000,
  minChars = 300,
): Promise<{ page: FetchedPage; attempt: FetchAttempt }> {
  return runEngine("wayback", url, timeoutMs, async (signal, ctx) => {
    const av = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { signal });
    if (!av.ok) {
      ctx.httpStatus = av.status;
      return { ok: false, error: `wayback_avail_${av.status}` };
    }
    const j = (await av.json()) as { archived_snapshots?: { closest?: { url?: string; available?: boolean; timestamp?: string } } };
    const snap = j.archived_snapshots?.closest;
    if (!snap?.available || !snap.url) return { ok: false, error: "wayback_no_snapshot" };
    ctx.urlUsed = snap.url;
    const res = await fetch(snap.url, { signal });
    ctx.httpStatus = res.status;
    if (!res.ok) return { ok: false, error: `wayback_${res.status}` };
    const html = (await res.text()).slice(0, 500_000);
    const markdown = htmlToMarkdown(html, 40_000);
    if (markdown.length < minChars) return { ok: false, error: "wayback_too_short", bytes: markdown.length };
    return { ok: true, markdown, title: titleFromHtml(html) };
  });
}

// archive.today / archive.ph — separate infra from Wayback, useful when
// Wayback has no snapshot (commercial sites, recent pages).
async function archiveTodayFetch(
  url: string,
  timeoutMs = 15_000,
  minChars = 300,
): Promise<{ page: FetchedPage; attempt: FetchAttempt }> {
  const snapUrl = `https://archive.ph/newest/${url}`;
  return runEngine("archive_today", url, timeoutMs, async (signal, ctx) => {
    const res = await fetch(snapUrl, {
      signal,
      redirect: "follow",
      headers: { "User-Agent": CHROME_UA, Accept: "text/html,*/*" },
    });
    ctx.httpStatus = res.status;
    if (!res.ok) {
      ctx.urlUsed = snapUrl;
      return { ok: false, error: `archive_today_${res.status}` };
    }
    const html = (await res.text()).slice(0, 500_000);
    const markdown = htmlToMarkdown(html, 40_000);
    if (markdown.length < minChars) return { ok: false, error: "archive_today_too_short", bytes: markdown.length };
    ctx.urlUsed = res.url;
    return { ok: true, markdown, title: titleFromHtml(html) };
  });
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

export async function scrapeWithFallback(
  url: string,
  opts: {
    jsonSchema?: object;
    jsonPrompt?: string;
    etag?: string;
    lastModified?: string;
    skipFirecrawl?: boolean;
    minContentChars?: number;
    preferFirecrawl?: boolean;
  } = {},
): Promise<FetchedPage> {
  const attempts: FetchAttempt[] = [];
  const push = (a: FetchAttempt) => attempts.push(a);
  const minContentChars = Math.max(100, opts.minContentChars ?? 200);

  // Runs Firecrawl once, records the attempt, and returns a success page if
  // it produced enough markdown (or structured JSON). Shared by the
  // prefer-first and last-resort call sites below.
  const tryFirecrawl = async (): Promise<FetchedPage | undefined> => {
    const tFc = Date.now();
    const fc = await firecrawlScrape(url, { jsonSchema: opts.jsonSchema, jsonPrompt: opts.jsonPrompt });
    push({
      engine: "firecrawl",
      ok: !!fc.ok,
      latency_ms: Date.now() - tFc,
      error: fc.ok ? undefined : fc.error,
      bytes: fc.ok ? fc.markdown.length : undefined,
      ts: new Date().toISOString(),
    });
    if (fc.ok && (fc.markdown.length >= minContentChars || fc.json)) {
      return {
        ok: true,
        url: fc.url,
        markdown: fc.markdown,
        title: fc.title,
        json: fc.json,
        via: fc.json ? "firecrawl_json" : "firecrawl",
        attempts,
      };
    }
    return undefined;
  };

  // For structured extraction workflows, callers may prefer Firecrawl first
  // so they don't lose JSON extraction behind an earlier markdown-only success.
  if (opts.preferFirecrawl && !opts.skipFirecrawl && firecrawlEnabled()) {
    const fcPage = await tryFirecrawl();
    if (fcPage) return fcPage;
  }

  // 1. Local engine
  const tEng = Date.now();
  const eng = await scrapeEngineFetch(url, { etag: opts.etag, lastModified: opts.lastModified });
  push({
    engine: "scrape_engine",
    ok: !!eng.ok,
    latency_ms: Date.now() - tEng,
    error: eng.ok ? undefined : eng.error,
    bytes: eng.ok ? eng.markdown.length : undefined,
    ts: new Date().toISOString(),
  });
  if (eng.ok && eng.markdown.length >= minContentChars) {
    return { ok: true, url: eng.url, markdown: eng.markdown, title: eng.title, via: "scrape_engine", attempts };
  }
  if (!eng.ok && (eng.gone || eng.blocked || eng.notModified)) {
    return { ok: false, url, error: eng.error, via: "scrape_engine", attempts };
  }

  // 2. Jina Reader
  const jr = await jinaReader(url, 20_000, minContentChars);
  push(jr.attempt);
  if (jr.page.ok) return { ...jr.page, attempts };

  // 3. Raw HTML (Chrome UA)
  const raw = await rawFetch(url, CHROME_UA, "raw_html", 10_000, minContentChars);
  push(raw.attempt);
  if (raw.page.ok) return { ...raw.page, attempts };

  // 4. Raw HTML (Googlebot UA) — many gov / news sites whitelist Googlebot
  //    but block desktop browsers from datacentre IPs.
  const gb = await rawFetch(url, GOOGLEBOT_UA, "raw_html_googlebot", 10_000, minContentChars);
  push(gb.attempt);
  if (gb.page.ok) return { ...gb.page, attempts };

  // 5. Wayback Machine
  const wb = await waybackFetch(url, 18_000, minContentChars);
  push(wb.attempt);
  if (wb.page.ok) return { ...wb.page, attempts };

  // 6. archive.today / archive.ph
  const at = await archiveTodayFetch(url, 15_000, minContentChars);
  push(at.attempt);
  if (at.page.ok) return { ...at.page, attempts };

  // 7. Optional Firecrawl
  if (!opts.skipFirecrawl && firecrawlEnabled()) {
    const tFc = Date.now();
    const fc = await firecrawlScrape(url, { jsonSchema: opts.jsonSchema, jsonPrompt: opts.jsonPrompt });
    push({
      engine: "firecrawl",
      ok: !!fc.ok,
      latency_ms: Date.now() - tFc,
      error: fc.ok ? undefined : fc.error,
      bytes: fc.ok ? fc.markdown.length : undefined,
      ts: new Date().toISOString(),
    });
    if (fc.ok && (fc.markdown.length >= minContentChars || fc.json)) {
      return {
        ok: true, url: fc.url, markdown: fc.markdown, title: fc.title, json: fc.json,
        via: fc.json ? "firecrawl_json" : "firecrawl", attempts,
      };
    }
  }

  const summary = attempts.map(a => `${a.engine}=${a.error ?? (a.ok ? "ok" : "fail")}`).join(" | ");
  return { ok: false, url, error: `all_engines_failed: ${summary}`, via: "none", attempts };
}

export async function searchWeb(query: string, limit = 10): Promise<SearchHit[]> {
  const r = await jinaSearch(query, limit);
  if (!r.ok) throw new Error(r.error);
  return r.hits;
}
