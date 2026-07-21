-- The configured Alberta resource uses the retired datastore_search_sql action
-- and no longer resolves as a valid datastore resource. Keep it visible and
-- diagnosable in the registry, but do not run it as if it were healthy.
update public.discovery_sources_registry
set
  enabled = false,
  last_status = 'failed',
  last_error = 'disabled_retired_source: datastore_search_sql removed and resource invalid',
  notes = concat_ws(
    E'\n',
    nullif(notes, ''),
    'Disabled 2026-07-21: replace only after validating a current official Alberta dataset and schema.'
  )
where dataset_key = 'alberta_ckan';
