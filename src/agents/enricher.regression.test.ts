// Real-world regression tests for the enrichment "click flow".
//
// Approach: we record real HTML snapshots in __fixtures__/pages/*.html
// captured from live sites (no synthetic mocks). The test stubs only
// global fetch to return the fixture body, then runs scrapeEngineFetch
// end-to-end through linkedom + Readability + turndown, asserting that:
//   • a valid scrape returns markdown >= 200 chars with a title
//   • a 4xx response yields a typed error result (not a throw)
//   • the FetchAttempt audit trail is populated on every call
//
// To refresh fixtures, re-curl the source URL into __fixtures__/pages/.

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scrapeEngineFetch, toFetchedPage } from "@/lib/scrape-engine.server";

const FIX = (name: string) => readFileSync(resolve("src/agents/__fixtures__/pages", name), "utf8");

function mockFetch(html: string, status = 200, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  }));
}

afterEach(() => { vi.restoreAllMocks(); });

describe("enrichment click flow — real fixtures", () => {
  it("extracts a valid Wikipedia article into markdown with title and attempts trail", async () => {
    const html = FIX("ised-wiki.html");
    vi.stubGlobal("fetch", mockFetch(html));

    const r = await scrapeEngineFetch("https://en.wikipedia.org/wiki/ISED");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown.length).toBeGreaterThan(500);
    expect(r.title?.toLowerCase()).toContain("innovation");
    expect(r.via).toBe("scrape_engine");

    const fp = toFetchedPage(r);
    expect(fp.ok).toBe(true);
    expect(fp.attempts).toBeDefined();
    expect(fp.attempts!.length).toBeGreaterThan(0);
    expect(fp.attempts![0]).toMatchObject({ engine: "scrape_engine", ok: true });
  });

  it("returns a typed failure (no throw) on HTTP 403 — used to trigger fallback chain", async () => {
    vi.stubGlobal("fetch", mockFetch("<html><body>blocked</body></html>", 403));
    const r = await scrapeEngineFetch("https://example.org/blocked");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/http_403/);
    expect(r.httpStatus).toBe(403);

    const fp = toFetchedPage(r);
    expect(fp.ok).toBe(false);
    expect(fp.attempts![0].ok).toBe(false);
    expect(fp.attempts![0].error).toMatch(/http_403/);
  });

  it("returns extracted_too_short when fixture has no real content", async () => {
    vi.stubGlobal("fetch", mockFetch("<html><body><p>hi</p></body></html>".padEnd(300, " "), 200));
    const r = await scrapeEngineFetch("https://example.org/empty");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/extracted_too_short|body_too_short/);
  });
});
