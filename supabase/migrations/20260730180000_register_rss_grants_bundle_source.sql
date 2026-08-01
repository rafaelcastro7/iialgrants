-- Same bug confirmed independently in this codebase's copy of the
-- source-curator pipeline (see the equivalent fix + live verification in the
-- other checkout's history): the orchestrator (source-curator/orchestrator.server.ts)
-- runs Tier A's RSS ingester under the key "rss_grants_bundle"
-- (fetchRssGrantCandidates), but discovery_sources_registry has no row for
-- that key -- only for "grants_gov" and "idrc_rss", two keys the orchestrator
-- never actually checks. Because the registry lookup in ingestorsForTier()
-- fails OPEN when a key has no row (`enabled.get(key) !== false` is true for
-- an unknown key), rss_grants_bundle has always still executed on every
-- Tier A run -- it's just invisible and non-disableable on /admin/sources,
-- and the two vestigial rows falsely suggest an admin has control over
-- sources that aren't actually what's running.
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
    'Disabled: this dataset_key does not match any key the orchestrator (source-curator/orchestrator.server.ts) actually checks -- the real RSS ingestion for this feed runs under rss_grants_bundle instead. Kept for audit history rather than deleted.'
  )
where dataset_key in ('grants_gov', 'idrc_rss');
