-- Registers the real Grants.gov Search2 REST API ingester
-- (src/lib/source-curator/grants-gov.server.ts) so it's visible/toggleable
-- on /admin/sources. This replaces a dead RSS feed
-- (rss.grants.gov/rss/GG_NewOppByCategory.xml) that had been silently
-- returning the grants.gov website's HTML instead of XML — verified live
-- 2026-07-23 that it never produced a single real candidate despite being
-- "enabled" the whole time. The old grants_gov/idrc_rss rows below were
-- already vestigial (the actual code bundles both feeds under
-- rss_grants_bundle's single dataset_key) — left as historical artifacts,
-- not touched here to avoid an unrelated cleanup in this migration.
insert into public.discovery_sources_registry
  (dataset_key, label, tier, format, source_url, enabled, notes)
values
  (
    'grants_gov_api',
    'Grants.gov (US Federal) — Search2 API',
    'A_daily',
    'json',
    'https://api.grants.gov/v1/api/search2',
    true,
    'Real REST API (no auth), replaces the dead grants_gov RSS feed which returned HTML, not XML.'
  )
on conflict (dataset_key) do nothing;
