create type public.org_stage as enum ('startup', 'sme', 'nonprofit', 'research', 'public_sector');

-- ============================================
-- org_profiles
-- ============================================
create table public.org_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_name text not null,
  sectors text[] not null default '{}'::text[],
  jurisdictions text[] not null default '{CA}'::text[],
  stage public.org_stage not null default 'sme',
  annual_budget_cad numeric(14,2),
  focus_areas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.org_profiles to authenticated;
grant all on public.org_profiles to service_role;
alter table public.org_profiles enable row level security;
create policy "org_profiles_self_all" on public.org_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger org_profiles_set_updated_at
  before update on public.org_profiles
  for each row execute function public.set_updated_at();

-- ============================================
-- grant_evaluations (per user × grant)
-- ============================================
create table public.grant_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  fit_score numeric(4,3) not null check (fit_score >= 0 and fit_score <= 1),
  rationale_en text not null,
  rationale_fr text,
  eligibility_pass boolean not null default true,
  model text not null,
  prompt_version text not null,
  run_id text,
  created_at timestamptz not null default now(),
  unique (user_id, grant_id)
);
grant select, insert, update, delete on public.grant_evaluations to authenticated;
grant all on public.grant_evaluations to service_role;
alter table public.grant_evaluations enable row level security;
create policy "grant_evaluations_self_all" on public.grant_evaluations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "grant_evaluations_admin_select" on public.grant_evaluations
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index grant_evaluations_user_score_idx
  on public.grant_evaluations(user_id, fit_score desc);