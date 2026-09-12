-- Final observability and rollout controls for the grant-search master plan.
-- Additive only: existing profiles, feedback and ranking behavior remain intact.

alter table public.grant_search_profiles
  add column if not exists last_reviewed_at timestamptz;

create table if not exists public.grant_search_runtime_config (
  is_singleton boolean primary key default true check (is_singleton),
  hybrid_enabled boolean not null default true,
  shadow_mode boolean not null default false,
  ranking_version text not null default 'hybrid_rrf_v2',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.grant_search_runtime_config (is_singleton)
values (true)
on conflict (is_singleton) do nothing;

alter table public.grant_search_runtime_config enable row level security;
drop policy if exists grant_search_runtime_config_authenticated_read
  on public.grant_search_runtime_config;
create policy grant_search_runtime_config_authenticated_read
  on public.grant_search_runtime_config for select to authenticated using (true);
drop policy if exists grant_search_runtime_config_admin_write
  on public.grant_search_runtime_config;
create policy grant_search_runtime_config_admin_write
  on public.grant_search_runtime_config for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
grant select on public.grant_search_runtime_config to authenticated;
grant all on public.grant_search_runtime_config to service_role;

drop trigger if exists grant_search_runtime_config_set_updated_at
  on public.grant_search_runtime_config;
create trigger grant_search_runtime_config_set_updated_at
  before update on public.grant_search_runtime_config
  for each row execute function public.set_updated_at();

create table if not exists public.grant_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  profile_id uuid references public.grant_search_profiles(id) on delete set null,
  query_text text not null check (char_length(query_text) between 2 and 500),
  filters jsonb not null default '{}'::jsonb,
  candidate_counts jsonb not null default '{}'::jsonb,
  latency_ms integer not null check (latency_ms >= 0),
  fusion_weights jsonb not null default '{}'::jsonb,
  index_version text not null,
  embedding_model text,
  taxonomy_version text not null,
  ranking_version text not null,
  retrieval_mode text not null check (retrieval_mode in ('hybrid','lexical-fallback','lexical-only','shadow')),
  degraded_reason text,
  result_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists grant_search_runs_user_created_idx
  on public.grant_search_runs(user_id, created_at desc);
create index if not exists grant_search_runs_org_created_idx
  on public.grant_search_runs(org_id, created_at desc);

alter table public.grant_search_runs enable row level security;
drop policy if exists grant_search_runs_self_or_admin_read on public.grant_search_runs;
create policy grant_search_runs_self_or_admin_read
  on public.grant_search_runs for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists grant_search_runs_self_insert on public.grant_search_runs;
create policy grant_search_runs_self_insert
  on public.grant_search_runs for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      org_id is null
      or org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
    )
    and (
      profile_id is null
      or exists (
        select 1 from public.grant_search_profiles sp
        where sp.id = profile_id and sp.user_id = auth.uid()
      )
    )
  );
grant select, insert on public.grant_search_runs to authenticated;
grant all on public.grant_search_runs to service_role;

create table if not exists public.grant_search_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  ranking_version text not null,
  k integer not null check (k > 0),
  summary jsonb not null,
  coverage jsonb not null,
  stale_case_ids text[] not null default '{}'::text[],
  thresholds_passed boolean not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists grant_search_benchmark_runs_created_idx
  on public.grant_search_benchmark_runs(created_at desc);
alter table public.grant_search_benchmark_runs enable row level security;
drop policy if exists grant_search_benchmark_runs_admin_read
  on public.grant_search_benchmark_runs;
create policy grant_search_benchmark_runs_admin_read
  on public.grant_search_benchmark_runs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
grant select on public.grant_search_benchmark_runs to authenticated;
grant all on public.grant_search_benchmark_runs to service_role;

