-- PFC retired both historical member-directory URLs and now serves 404 pages.
-- Disable the source instead of reporting a healthy empty ingestion or wasting
-- a monthly Firecrawl attempt. CRA T3010 remains the authoritative replacement.
update public.discovery_sources_registry
set
  enabled = false,
  last_status = 'failed',
  last_error = 'disabled_retired_source: PFC member directory removed (HTTP 404)',
  notes = 'Retired directory. Re-enable only after PFC publishes a verified public member listing; use CRA T3010 line 5050 meanwhile.'
where dataset_key = 'pfc_members';
