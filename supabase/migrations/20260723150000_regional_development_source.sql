-- Registers the regional-development-agency seed ingester
-- (src/lib/source-curator/regional-development.server.ts) so it's
-- visible/toggleable on /admin/sources, same pattern as tri_council. The
-- funder catalog had only 12 rows (several inactive) before this — 17
-- verified real Canadian federal regional development agencies + sector +
-- provincial innovation funders were missing entirely.
insert into public.discovery_sources_registry
  (dataset_key, label, tier, format, source_url, cadence_cron, enabled, notes)
values
  (
    'regional_development',
    'Regional development agencies + provincial innovation funders',
    'B_weekly',
    'html_scrape',
    'https://www.canada.ca/en/atlantic-canada-opportunities.html,https://innovatebc.ca,https://albertainnovates.ca',
    '45 4 * * 1',
    true,
    'Federal regional development agencies (ACOA, CED-Q, FedDev Ontario, FedNor, PrairiesCan, PacifiCan, CanNor) + sector funders (NRCan, Futurpreneur, BDC, EDC) + provincial innovation agencies (Innovate BC, Alberta Innovates, Innovation Saskatchewan, Invest Nova Scotia, ONB, OCI). Every URL verified live 2026-07-23.'
  )
on conflict (dataset_key) do nothing;
