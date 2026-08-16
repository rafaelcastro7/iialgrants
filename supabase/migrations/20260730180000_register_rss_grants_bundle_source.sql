-- rss_grants_bundle (src/lib/source-curator/rss-grants.server.ts, run by the
-- orchestrator under key "rss_grants_bundle") had no discovery_sources_registry
-- row at all. Confirmed live 2026-07-30: discovery_sources_registry had 13
-- rows, but the orchestrator's ingestorsForTier("A"/"all") pushes the keys
-- "rss_grants_bundle" and "grants_gov_api" for Tier A — not "grants_gov" or
-- "idrc_rss", which are the two RSS rows actually present. Because the
-- registry lookup in ingestorsForTier() fails OPEN when a key has no row
-- (`enabled.get(key) !== false` is true for an unknown key), rss_grants_bundle
-- has always still executed on every Tier A run — it just never showed up on
-- /admin/sources, and an admin could never disable it there.
--
-- grants_gov and idrc_rss are the vestigial rows already called out in
-- 20260723000000_grants_gov_api_source.sql's comment: their source_url values
-- (grants.gov's dead RSS feed, and idrc.ca's now-relocated feed at
-- idrc-crdi.ca) are not what rss-grants.server.ts actually polls today — that
-- code bundles idrc-crdi.ca's current feed (plus others) under the single
-- rss_grants_bundle key. Disabling instead of deleting, consistent with how
-- alberta_ckan/pfc_members were retired elsewhere in this registry, so the
-- audit trail (previous last_status/last_error, if any) isn't lost.
insert into public.discovery_sources_registry
  (dataset_key, label, tier, format, source_url, enabled, notes)
values
  (
    'rss_grants_bundle',
    'Grant RSS feed bundle (multi-source)',
    'A_daily',
    'rss',
    null,
    true,
    'Bundles multiple grant RSS feeds (see GRANT_FEEDS in rss-grants.server.ts); previously ran on every Tier A pass with no registry row, so it was invisible/non-toggleable on /admin/sources.'
  )
on conflict (dataset_key) do nothing;

update public.discovery_sources_registry
set
  enabled = false,
  notes = concat_ws(
    E'\n',
    nullif(notes, ''),
    'Disabled 2026-07-30: this dataset_key does not match any key the orchestrator (source-curator/orchestrator.server.ts) actually checks — the real RSS ingestion for this feed runs under rss_grants_bundle instead. Kept for audit history rather than deleted.'
  )
where dataset_key in ('grants_gov', 'idrc_rss');
