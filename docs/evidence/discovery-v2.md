# Discovery v2 — IIAL

**Status:** shipped 2026-06-20.

## Goal

Replace the v1 pipeline (1 URL → strip HTML → 30 KB to LLM) with a
multi-page, structured, deduplication-safe pipeline powered by Firecrawl.

## Pipeline

```
funder.source_url
   │
   ▼
[firecrawlMap]   ─► up to 50 candidate URLs
   │
   ▼
[filterProgramUrls]   ─► drop news/blog/PDF/contact, keep program-looking paths
   │  (≤ 8 URLs per run, budget guard)
   ▼
[firecrawlScrape]   ─► clean markdown per page (JS rendered, main content only)
   │
   ▼
[LLM per page: is_program? + DiscoveredGrant]   ─► single small schema
   │
   ▼
[canonical_key = sha256(funder|normalized_title|amount_band)]
   │
   ├─► unique: insert grants row (status='discovered')
   └─► duplicate: bump times_seen, last_seen_at
   │
   ▼
[autoEvaluate] for the admin who triggered (Evaluator runs on 'discovered')
```

## Fallback

When `FIRECRAWL_API_KEY` is absent the discoverer reverts to the v1 strategy
(fetch + HTML strip + array extraction). Same `canonical_key` dedupe.

## Telemetry

Each run writes one `agent_runs` row with metadata:
- `engine`: `firecrawl_v2` | `fallback`
- `urls_mapped`, `urls_scraped`, `urls_skipped`
- `inserted`, `seen_again`

## Schema additions

- `funders.source_urls text[]` — optional extra index URLs per funder.
- `grants.canonical_key text` (unique index) — dedupe key.
- `discovery_sources.parent_url text` — link child scrape rows to parent index.

## Budget

Per `discoverAllFunders` run (5 active funders by default):
- map: 5 calls
- scrape: ≤ 40 calls
- LLM extraction: ≤ 40 Gemini Flash calls
- LLM evaluator: ≤ 15 Gemini Flash calls (auto-fit for the triggering admin)
