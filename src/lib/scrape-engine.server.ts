// Own scrape engine — replaces Firecrawl for the common case.
//
// Pipeline:
//   1. robots.txt check (per-host cache)
//   2. host throttle (in-process token bucket, ≥1.5s between hits)
//   3. fetch with ETag / If-Modified-Since (conditional GET)
//   4. parse with linkedom → @mozilla/readability (Firefox Reader algorithm)
//   5. turndown → clean LLM-ready markdown
//
// Returns the same FetchedPage shape as the legacy fallback chain so
// callers (discoverer, enricher, evidence) don't need to change.
//
// Pure JS, no native deps — safe for the Cloudflare Worker SSR runtime.

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import robotsParser from "robots-parser";
import type { FetchedPage } from "@/lib/web-fetch.server";

// Realistic desktop browser UA — government sites (NRC, ISED, gc.ca) and many
// Cloudflare-protected hosts return 403 for scraper-looking UAs. We still
// honour robots.txt and per-host throttling.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MIN_GAP_MS = 1500; // per-host politeness
const ROBOTS_TTL_MS = 6 * 3600_000; // 6h cache

const robotsCache = new Map<string, { allow: (url: string) => boolean; expires: number }>();
const lastHitAt = new Map<string, number>();

// Exported so other engines (e.g. browser-render.server.ts) share the SAME
// robots cache and per-host throttle state — two engines hitting one host
// independently would defeat the politeness guarantee.
export async function loadRobots(origin: string): Promise<(url: string) => boolean> {
  const cached = robotsCache.get(origin);
  if (cached && cached.expires > Date.now()) return cached.allow;
  let txt = "";
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) txt = await res.text();
  } catch {
    /* missing robots = allow all */
  }
  const parser = robotsParser(`${origin}/robots.txt`, txt);
  const allow = (url: string) => parser.isAllowed(url, UA) !== false;
  robotsCache.set(origin, { allow, expires: Date.now() + ROBOTS_TTL_MS });
  return allow;
}

export async function throttle(host: string): Promise<void> {
  const last = lastHitAt.get(host) ?? 0;
  const wait = MIN_GAP_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHitAt.set(host, Date.now());
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});
// Drop noise.
turndown.remove(["script", "style", "noscript", "iframe", "form", "nav", "footer"]);

// Shared HTML → LLM-ready-markdown pipeline (Readability main-content
// extraction, falling back to whole-body turndown, falling back to a crude
// tag-strip). Exported so browser-render.server.ts's post-JS HTML goes
// through the exact same deterministic extraction as the static-fetch path —
// one extraction algorithm, two ways of obtaining the HTML.
export function htmlToReadableMarkdown(
  html: string,
  url: string,
): { title?: string; markdown: string } {
  let title: string | undefined;
  let mainHtml: string | null = null;
  try {
    const { document } = parseHTML(html);
    // Readability needs an absolute base URL to resolve hrefs.
    try {
      const baseEl = document.createElement("base");
      baseEl.setAttribute("href", url);
      document.head?.appendChild(baseEl);
    } catch {
      /* no head, fine */
    }
    // Cast: linkedom's Document is structurally compatible with Readability's expectation.
    const reader = new Readability(document as unknown as Document, { charThreshold: 250 });
    const article = reader.parse();
    if (article) {
      title = article.title || undefined;
      mainHtml = article.content || null;
    }
    if (!title) {
      const t = document.querySelector("title")?.textContent;
      if (t) title = t.trim();
    }
  } catch (e) {
    // Readability failed (often on weird/SPA markup) — fall through to raw turndown.
    void e;
  }

  let markdown = "";
  try {
    if (mainHtml) {
      markdown = turndown.turndown(mainHtml).trim();
    } else {
      // Strip script/style then turndown the body.
      const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
      markdown = turndown.turndown(cleaned).trim();
    }
  } catch {
    markdown = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Collapse excessive blank lines, hard cap.
  markdown = markdown.replace(/\n{3,}/g, "\n\n").slice(0, 60_000);
  return { title, markdown };
}

export type ScrapeEngineResult =
  | {
      ok: true;
      via: "scrape_engine";
      url: string;
      title?: string;
      markdown: string;
      httpStatus: number;
      etag?: string;
      lastModified?: string;
      bytes: number;
    }
  | {
      ok: false;
      via: "scrape_engine";
      url: string;
      error: string;
      httpStatus?: number;
      gone?: boolean;
      blocked?: boolean;
      notModified?: boolean;
      etag?: string;
      lastModified?: string;
    };

export async function scrapeEngineFetch(
  url: string,
  opts: { etag?: string; lastModified?: string; timeoutMs?: number } = {},
): Promise<ScrapeEngineResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, via: "scrape_engine", url, error: "invalid_url" };
  }
  const origin = parsed.origin;
  const host = parsed.host;

  // robots.txt
  try {
    const allow = await loadRobots(origin);
    if (!allow(url))
      return { ok: false, via: "scrape_engine", url, error: "robots_disallow", blocked: true };
  } catch {
    /* tolerate parser errors */
  }

  await throttle(host);

  // Conditional GET headers
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.5",
  };
  if (opts.etag) headers["If-None-Match"] = opts.etag;
  if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;

  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
      redirect: "follow",
    });
  } catch (e) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (res.status === 304) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: "not_modified",
      httpStatus: 304,
      notModified: true,
      etag: res.headers.get("etag") ?? opts.etag,
      lastModified: res.headers.get("last-modified") ?? opts.lastModified,
    };
  }
  if (res.status === 404 || res.status === 410) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: `http_${res.status}`,
      httpStatus: res.status,
      gone: true,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: `http_${res.status}`,
      httpStatus: res.status,
    };
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct && !/html|xml|text/i.test(ct)) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: `unsupported_content_type:${ct}`,
      httpStatus: res.status,
    };
  }

  let html: string;
  try {
    html = (await res.text()).slice(0, 1_500_000);
  } catch (e) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: `read_body_failed:${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (html.length < 200) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: "body_too_short",
      httpStatus: res.status,
    };
  }

  const { title, markdown: rawMarkdown } = htmlToReadableMarkdown(html, url);
  const markdown = rawMarkdown;

  if (markdown.length < 200) {
    return {
      ok: false,
      via: "scrape_engine",
      url,
      error: "extracted_too_short",
      httpStatus: res.status,
    };
  }

  return {
    ok: true,
    via: "scrape_engine",
    url,
    title,
    markdown,
    httpStatus: res.status,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
    bytes: markdown.length,
  };
}

// Adapter to legacy FetchedPage shape used by web-fetch.server.ts callers.
export function toFetchedPage(r: ScrapeEngineResult): FetchedPage {
  const attempts = [
    {
      engine: "scrape_engine" as const,
      ok: !!r.ok,
      latency_ms: 0,
      error: r.ok ? undefined : r.error,
      bytes: r.ok ? r.markdown.length : undefined,
      ts: new Date().toISOString(),
    },
  ];
  if (r.ok)
    return {
      ok: true,
      url: r.url,
      markdown: r.markdown,
      title: r.title,
      via: "scrape_engine",
      attempts,
    };
  return { ok: false, url: r.url, error: r.error, via: "scrape_engine", attempts };
}
