-- Admin-configurable knobs for grant discovery/search behavior. Previously
-- every tuning lever (noise-URL denylist, program-hint keywords, funder-scout
-- seed queries, RSS feed list, candidate approval thresholds, page/concurrency
-- limits) lived only as hardcoded constants scattered across
-- discoverer.impl.server.ts, funder-scout.server.ts, rss-grants.server.ts and
-- orchestrator.server.ts — every change required a code deploy. This is a
-- singleton row (admins edit the one row via /admin/discovery-config); every
-- reader falls back to the hardcoded defaults it always used if this row is
-- missing, unreachable, or a field is empty, so discovery can never break
-- because this table is empty or RLS-blocked.
create table public.discovery_config (
  is_singleton boolean primary key default true check (is_singleton),
  max_pages_per_run integer not null default 15 check (max_pages_per_run between 1 and 100),
  scrape_concurrency integer not null default 3 check (scrape_concurrency between 1 and 20),
  fallback_max_links integer not null default 12 check (fallback_max_links between 1 and 100),
  firecrawl_search_query text not null default 'program funding grant subvention financement',
  -- Additive on top of the hardcoded denylists/allowlists, never a replacement.
  extra_non_grant_url_patterns text[] not null default '{}',
  extra_root_index_paths text[] not null default '{}',
  extra_program_hint_keywords text[] not null default '{}',
  extra_non_program_keywords text[] not null default '{}',
  -- Empty = use the built-in default seed queries / feed list.
  funder_scout_queries text[] not null default '{}',
  extra_rss_feeds jsonb not null default '[]',
  candidate_auto_approve_threshold integer not null default 80 check (candidate_auto_approve_threshold between 0 and 100),
  candidate_review_min_threshold integer not null default 40 check (candidate_review_min_threshold between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.discovery_config (is_singleton) values (true);

alter table public.discovery_config enable row level security;

create policy discovery_config_authenticated_select
  on public.discovery_config
  for select to authenticated using (true);

create policy discovery_config_admin_write
  on public.discovery_config
  for all to authenticated
  using (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ));

grant select on public.discovery_config to authenticated;
grant all on public.discovery_config to service_role;

drop trigger if exists discovery_config_set_updated_at on public.discovery_config;
create trigger discovery_config_set_updated_at
  before update on public.discovery_config
  for each row execute function public.set_updated_at();
