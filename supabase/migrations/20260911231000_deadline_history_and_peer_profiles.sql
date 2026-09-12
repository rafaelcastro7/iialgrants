alter table public.grant_search_profiles
  add column if not exists peer_organizations text[] not null default '{}'::text[];

create table if not exists public.grant_deadline_observations (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  observed_deadline date not null,
  source_url text not null,
  evidence_span_id uuid references public.evidence_spans(id) on delete set null,
  observed_at timestamptz not null default now(),
  unique(grant_id, observed_deadline, source_url)
);

create index if not exists grant_deadline_observations_grant_date_idx
  on public.grant_deadline_observations(grant_id, observed_deadline desc);

alter table public.grant_deadline_observations enable row level security;
drop policy if exists grant_deadline_observations_authenticated_read
  on public.grant_deadline_observations;
create policy grant_deadline_observations_authenticated_read
  on public.grant_deadline_observations for select to authenticated using (true);
grant select on public.grant_deadline_observations to authenticated;
grant all on public.grant_deadline_observations to service_role;

