## Goal

Eliminate the Firecrawl dependency and add a "crawl ledger" so the discoverer never re-scrapes a page until it's due, like Common Crawl / Scrapy / Diffbot do it. All free and self-hosted.

## What others do (research)

| System | Key technique we adopt |
|---|---|
| **Scrapy** / **Apache Nutch** | Per-URL `next_fetch_at` with adaptive recrawl interval based on change rate |
| **Firecrawl** (OSS core) | `fetch → readability → markdown → main-content extraction` pipeline |
| **Diffbot / Mercury** | DOM scoring (Readability algorithm) to isolate main content |
| **Common Crawl** | `robots.txt` cache + per-host politeness window (crawl-delay) |
| **Jina Reader** | LLM-friendly markdown output (we already use as fallback) |
| **SingleFile / Playwright** | JS rendering only when static HTML is < N chars |

## Architecture

```text
┌──────────────────────────────────────────────────┐
│  scrape-engine.server.ts (NEW)                   │
│   1. crawl_ledger lookup  → skip if not due      │
│   2. robots.txt cache     → respect Disallow     │
│   3. host throttle        → min 2s between hits  │
│   4. fetch(static HTML)                          │
│   5. if < 800 chars + JS-heavy → headless render │
│      (linkedom + @mozilla/readability)           │
│   6. Readability → main content                  │
│   7. turndown → clean markdown                   │
│   8. content_hash → detect change                │
│   9. update crawl_ledger (next_fetch_at)         │
└──────────────────────────────────────────────────┘
```

### Libraries (all MIT, ship to Worker)
- `@mozilla/readability` + `linkedom` — main-content extraction (same algo Firefox Reader View uses; what Firecrawl wraps)
- `turndown` — HTML→Markdown
- `robots-parser` — robots.txt compliance
- No Playwright/Puppeteer (Node-only, breaks Workers). JS-render fallback stays on Jina Reader (which already does headless render for free).

## Crawl ledger (the "mark sources already used" requirement)

New table `crawl_ledger`:

| column | purpose |
|---|---|
| `url` (pk) | canonical URL |
| `host` | for per-host throttling |
| `last_fetched_at` | when we last hit it |
| `next_fetch_at` | adaptive: 7d if unchanged twice, 1d if changed, 24h default |
| `content_hash` | sha256 of extracted markdown |
| `change_count` | how many times content shifted |
| `status` | `ok` / `gone` / `blocked` / `error` |
| `etag`, `last_modified` | conditional GET headers for cheap re-checks |
| `fetch_count`, `error_count` | health |

Discoverer reads `WHERE next_fetch_at <= now()` and skips the rest. Admin UI shows: "X URLs due now, Y queued for next 24h, Z stable (weekly cadence)".

## Files to change

- **NEW** `supabase/migrations/<ts>_crawl_ledger.sql` — table + GRANTs + RLS (service_role only)
- **NEW** `src/lib/scrape-engine.server.ts` — Readability + turndown + robots + throttle
- **NEW** `src/lib/crawl-ledger.server.ts` — `shouldFetch(url)`, `recordFetch(url, hash, status)`
- **MODIFY** `src/lib/web-fetch.server.ts` — drop Firecrawl from default chain; new order: `scrape-engine → jina-reader → raw`. Keep Firecrawl behind `USE_FIRECRAWL=1` opt-in.
- **DELETE** `src/lib/firecrawl.server.ts` (or keep as opt-in shim)
- **MODIFY** `src/agents/discoverer.impl.server.ts` — call `shouldFetch()` before each URL, `recordFetch()` after
- **NEW** `src/components/admin/CrawlLedgerWidget.tsx` on `/admin/sources` — shows due / queued / stable counts per funder
- **NEW** `src/lib/scrape-engine.test.ts` — golden HTML fixtures, asserts markdown matches snapshot
- **NEW** `src/lib/crawl-ledger.test.ts` — asserts adaptive scheduling math
- **MODIFY** all 6 references to firecrawl in tests/components to use the new engine

## Cadence rules (Nutch-style)

- First fetch: `next = now + 24h`
- If unchanged on re-fetch: `next = min(prev_interval × 1.5, 14d)`
- If changed: `next = max(prev_interval × 0.5, 6h)`, bump `change_count`
- HTTP 304: same as unchanged, but free (uses ETag)
- HTTP 404/410: status=`gone`, `next = now + 30d` (sanity recheck)
- HTTP 429/5xx: exponential backoff, max 7d

## Validation

1. `bun test src/lib/scrape-engine.test.ts` — Readability extraction matches Firecrawl output on 5 fixture pages within 90% token overlap
2. Live test: run discoverer on `investquebec.com` without `FIRECRAWL_API_KEY` → must ingest ≥ 10 grants
3. Re-run immediately → ledger skips all URLs, 0 new fetches
4. Force ledger `next_fetch_at = now - 1h` → re-fetches, hash unchanged, interval extends to 36h
5. `/admin/sources` shows ledger widget with correct counts

## Out of scope (this iteration)

- Distributed crawl queue (single Worker is fine for current scale)
- Full-text search index of fetched pages
- Replacing Jina Reader (kept as JS-render fallback — it's free and works)
