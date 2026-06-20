
create table if not exists public.discovery_sources (
  id uuid primary key default gen_random_uuid(),
  funder_id uuid not null references public.funders(id) on delete cascade,
  url text not null,
  content_hash text,
  etag text,
  last_modified text,
  http_status int,
  text_length int,
  grants_found int not null default 0,
  grants_inserted int not null default 0,
  times_seen int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funder_id, url)
);

grant select on public.discovery_sources to authenticated;
grant all on public.discovery_sources to service_role;

alter table public.discovery_sources enable row level security;

create policy "discovery_sources: admin can read"
  on public.discovery_sources for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create trigger discovery_sources_set_updated_at
  before update on public.discovery_sources
  for each row execute function public.set_updated_at();

create index if not exists discovery_sources_funder_idx on public.discovery_sources(funder_id);
create index if not exists discovery_sources_last_fetched_idx on public.discovery_sources(last_fetched_at desc);

-- Grant-level history columns
alter table public.grants
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists times_seen int not null default 1;

-- Funder-level freshness
alter table public.funders
  add column if not exists last_discovered_at timestamptz,
  add column if not exists last_content_hash text;
