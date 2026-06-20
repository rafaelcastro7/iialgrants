# Free-tier amplifiers — evidence

Updated: 2026-06-20

This iteration adds fully-free augmentations to the Discovery v2 pipeline,
plus a human-curation bridge to NotebookLM. Total cost added: **0 credits**
beyond existing Firecrawl / Lovable AI usage.

## F1 — Fallback chain for scraping (`src/lib/web-fetch.server.ts`)

`scrapeWithFallback(url, opts)` cascades:

```
Firecrawl (structured JSON) → Jina Reader (free markdown) → raw HTML fetch
```

- Jina Reader (`https://r.jina.ai/<url>`) works without an API key; if
  `JINA_API_KEY` is later added as a secret, it is attached for higher
  rate limits.
- The Discoverer records which engine each page came from in
  `agent_runs.metadata.via_counts`, e.g. `{ firecrawl_json: 9, jina_reader: 2 }`.

## F2 — Seed search when Firecrawl map is sparse

When `firecrawlMap` returns < 3 candidate URLs for a funder, the Discoverer
now calls `jinaSearch("site:<host> (program OR funding OR grant OR ...)")`
and merges the hits into the candidate set. Telemetry field:
`agent_runs.metadata.seed_search_used` (count of hits seeded).

## F3 — Government RSS ingestor + hourly cron

- `src/lib/rss-ingestor.server.ts` polls a small set of official RSS feeds
  (`canada.ca`, `nrc.canada.ca`, `ic.gc.ca`), parses items, and matches them
  to active funders by domain. When matches occur, it enqueues a targeted
  discovery job for only those funders.
- `src/routes/api/public/hooks/rss-poll.ts` exposes the trigger, authenticated
  by the Supabase anon key in the `apikey` header (per the documented pg_cron
  pattern).
- pg_cron schedule `iial-rss-poll-hourly` (`0 * * * *`) calls the hook every
  hour via `pg_net.http_post`.

## F4 — NotebookLM bridge

- `exportGrantsForNotebookLM({ status, limit })` returns a single concatenated
  markdown document (one source, multiple delimited entries) plus a JSON index
  of `{ id, title, url }`. The UI button downloads the markdown as
  `iial-curation-YYYY-MM-DD.md` — drop it into a NotebookLM notebook as a
  single source.
- `markGrantsCurated({ grantIds, note })` lets the curator paste the IIAL
  IDs of approved grants back into IIAL. The grants transition to
  `shortlisted`, and the action is recorded in `grant_events` with
  `metadata.source = "curator_notebooklm"` and the curator note.
- UI: `src/components/grants/NotebookLMBridge.tsx`, mounted in
  `/grants` next to the Discover button (admin-only).

## F5 — Staleness decay

pg_cron job `iial-decay-stale-grants` (`15 3 * * *`) demotes grants to
`expired` when both:

- `last_seen_at < NOW() - 30 days`
- `deadline IS NULL` or `deadline < CURRENT_DATE`

Pure SQL, no external calls.

## Operational notes

- All free services degrade gracefully: Jina endpoints rate-limit silently,
  raw HTML works for almost any static page.
- The RSS ingestor uses the all-zeros UUID as `triggeringUserId`, which makes
  the orchestrator skip the per-user Evaluator pass (no org profile match).
  Run the user-scoped Evaluator manually or wait for the next admin visit
  to `/grants`.
- pg_cron jobs are visible in `cron.job` / `cron.job_run_details`.

## What's intentionally not built

- **Zapier / n8n** — replaced by pg_cron + `/api/public/hooks/*`.
- **Per-user OAuth to NotebookLM** — Google does not expose a public API.
  The markdown-bundle bridge is the most efficient workaround.
- **Semantic dedup** — deferred until we observe duplicate variants in
  production telemetry (`agent_runs.metadata.seen_again`).
