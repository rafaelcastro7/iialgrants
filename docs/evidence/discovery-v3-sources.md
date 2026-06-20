# Discovery v3 — Self-Growing Source Catalog

**Status:** shipped 2026-06-20.

## Goal

Move from a fixed seed of ~5 funders to a **continuously growing catalog**
sourced from every viable Canadian (and Canada-relevant) public dataset, RSS
feed, charity registry, and web-wide scout query.

## Tiers & cadence

| Tier  | When            | Ingestors                                                  |
| ----- | --------------- | ---------------------------------------------------------- |
| **A** | daily (03:00)   | `rss_grants_bundle` (Grants.gov, IDRC, NSERC, SSHRC, CIHR) |
| **B** | weekly (Mon 04) | `bbf_programs`, `eu_ft_portal`                             |
| **scout** | weekly (Mon 05) | `funder_scout` (Jina + LLM web-wide)                  |
| **C** | monthly (1st)   | `tbs_gc`, `pfc_members`, `t3010_charities`, `otf_open`, `alberta_ckan` |

Each tier hits a public webhook:

- `POST /api/public/hooks/source-tier-a`  (daily)
- `POST /api/public/hooks/source-tier-b`  (weekly — runs Tier B + scout)
- `POST /api/public/hooks/source-curator` (monthly — Tier C)

Webhook auth: Supabase publishable key in `apikey` header (pg_cron pattern).

## Pipeline

```
ingestor → RawCandidate[]
         → findDuplicate (BN exact, then fuzzy name ≥0.88)
         → scoreCandidate (BN, $, website, signals, province, type)
         → score < 40 → drop
         → score < 80 → funder_candidates (pending_review)
         → score ≥ 80 → funder_candidates (approved) + funders row
         ↓
auto_promote_stale_candidates() (daily):
   pending_review + score ≥ 70 + ≥2 signals + age ≥7 days → funders
         ↓
existing Discoverer (Firecrawl v2) extracts grants per funder
```

## Telemetry

- `source_ingest_runs` — one row per (ingestor, run): rows_in, candidates_out,
  auto_approved, errors, latency_ms, run_id, tier.
- `discovery_sources_registry.last_run_at / last_status / last_error` —
  last-known health.
- View `source_health_summary` — last 30 d: success rate, totals, avg latency.
- View `funder_source_yield` — per funder: grants_total, grants_30d.

## Admin Console

`/admin/sources` lists every registered source grouped by tier, shows last
run + 30 d yield + health badge, lets admins enable/disable each source,
trigger a tier on demand, and run the auto-promote loop manually.

## Adding a new source

1. Write `src/lib/source-curator/<key>.server.ts` exporting an async fn that
   returns `RawCandidate[]`.
2. Add it to the relevant tier branch in `orchestrator.server.ts`
   `ingestorsForTier`.
3. Add a seed row in `discovery_sources_registry` (migration).
4. Done — appears in `/admin/sources` automatically.

## Budget

- Tier A: ~6 RSS HTTP calls per day, no LLM cost.
- Tier B: 2 HTTP calls + scout (~6 Jina queries + 6 LLM Flash calls) per week.
- Tier C: 5 large pulls per month (CKAN SQL, HTML scrapes, CSV).
- All public datasets, no paid subscriptions required.
