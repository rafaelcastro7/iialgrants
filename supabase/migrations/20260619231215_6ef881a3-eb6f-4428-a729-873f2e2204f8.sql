-- Fase 1 — Discovery + Ingesta
-- Cubre RF-001, RF-002, RF-003, RF-005

-- Enums
create type public.grant_status as enum (
  'discovered', 'enriched', 'scored', 'shortlisted',
  'in_proposal', 'submitted', 'won', 'lost', 'expired', 'archived'
);
create type public.funder_source_type as enum ('rss', 'api', 'html', 'manual');
create type public.agent_name as enum (
  'discoverer', 'enricher', 'evaluator', 'strategist', 'writer', 'critic'
);
create type public.agent_status as enum ('running', 'succeeded', 'failed', 'degraded');

-- ============================================
-- funders
-- ============================================
create table public.funders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_fr text,
  country text not null default 'CA',
  jurisdiction text,           -- ex: 'federal', 'QC', 'ON', 'municipal'
  website text,
  source_type public.funder_source_type not null default 'manual',
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, country)
);
grant select on public.funders to authenticated;
grant all on public.funders to service_role;
alter table public.funders enable row level security;
create policy "funders_read_authenticated" on public.funders
  for select to authenticated using (active = true or public.has_role(auth.uid(), 'admin'));
create policy "funders_admin_write" on public.funders
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger funders_set_updated_at
  before update on public.funders
  for each row execute function public.set_updated_at();

-- ============================================
-- grants
-- ============================================
create table public.grants (
  id uuid primary key default gen_random_uuid(),
  funder_id uuid not null references public.funders(id) on delete cascade,
  title text not null,
  title_fr text,
  summary text,
  summary_fr text,
  amount_cad_min numeric(14,2),
  amount_cad_max numeric(14,2),
  currency text not null default 'CAD',
  deadline date,
  eligibility jsonb not null default '{}'::jsonb,
  sectors text[] not null default '{}'::text[],
  country text not null default 'CA',
  language text not null default 'en',     -- original notice language
  url text not null,
  source_hash text not null unique,        -- dedup key
  status public.grant_status not null default 'discovered',
  fit_score numeric(4,3),                  -- 0..1, set by Evaluator
  discovered_at timestamptz not null default now(),
  enriched_at timestamptz,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_cad_min is null or amount_cad_max is null or amount_cad_min <= amount_cad_max),
  check (fit_score is null or (fit_score >= 0 and fit_score <= 1))
);
grant select on public.grants to authenticated;
grant all on public.grants to service_role;
alter table public.grants enable row level security;
create policy "grants_read_authenticated" on public.grants
  for select to authenticated using (true);
create policy "grants_admin_write" on public.grants
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index grants_status_idx on public.grants(status);
create index grants_deadline_idx on public.grants(deadline) where deadline is not null;
create index grants_funder_idx on public.grants(funder_id);
create index grants_sectors_gin on public.grants using gin(sectors);
create index grants_fit_score_idx on public.grants(fit_score desc nulls last);

create trigger grants_set_updated_at
  before update on public.grants
  for each row execute function public.set_updated_at();

-- ============================================
-- grant_events (immutable state-transition log)
-- ============================================
create table public.grant_events (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  from_status public.grant_status,
  to_status public.grant_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_agent public.agent_name,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.grant_events to authenticated;
grant all on public.grant_events to service_role;
alter table public.grant_events enable row level security;
create policy "grant_events_read_authenticated" on public.grant_events
  for select to authenticated using (true);
create policy "grant_events_insert_self" on public.grant_events
  for insert to authenticated with check (actor_user_id = auth.uid());

create index grant_events_grant_idx on public.grant_events(grant_id, created_at desc);

-- Auto-log state changes via trigger
create or replace function public.log_grant_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.grant_events (grant_id, from_status, to_status, metadata)
    values (new.id, old.status, new.status, jsonb_build_object('source', 'trigger'));
  elsif (TG_OP = 'INSERT') then
    insert into public.grant_events (grant_id, from_status, to_status, metadata)
    values (new.id, null, new.status, jsonb_build_object('source', 'insert'));
  end if;
  return new;
end;
$$;
revoke execute on function public.log_grant_transition() from public, anon, authenticated;

create trigger grants_log_transition
  after insert or update of status on public.grants
  for each row execute function public.log_grant_transition();

-- State-machine guard: enforce valid transitions
create or replace function public.validate_grant_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  valid boolean := false;
begin
  if TG_OP <> 'UPDATE' then return new; end if;
  if new.status = old.status then return new; end if;
  -- allowed transitions
  valid := case old.status
    when 'discovered'  then new.status in ('enriched','archived','expired')
    when 'enriched'    then new.status in ('scored','archived','expired')
    when 'scored'      then new.status in ('shortlisted','archived','expired')
    when 'shortlisted' then new.status in ('in_proposal','archived','expired')
    when 'in_proposal' then new.status in ('submitted','archived','expired')
    when 'submitted'   then new.status in ('won','lost','expired')
    when 'won'         then false
    when 'lost'        then false
    when 'expired'     then new.status = 'archived'
    when 'archived'    then false
    else false
  end;
  if not valid then
    raise exception 'invalid grant state transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_grant_transition() from public, anon, authenticated;

create trigger grants_validate_transition
  before update of status on public.grants
  for each row execute function public.validate_grant_transition();

-- ============================================
-- agent_runs (RNF: observability for the 6 agents)
-- ============================================
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,                 -- correlation id (OTel)
  agent public.agent_name not null,
  status public.agent_status not null default 'running',
  model text,                            -- e.g. 'google/gemini-2.5-flash'
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,6),
  latency_ms integer,
  user_id uuid references auth.users(id) on delete set null,
  grant_id uuid references public.grants(id) on delete set null,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.agent_runs to authenticated;
grant all on public.agent_runs to service_role;
alter table public.agent_runs enable row level security;
create policy "agent_runs_self_select" on public.agent_runs
  for select to authenticated using (user_id = auth.uid());
create policy "agent_runs_admin_select" on public.agent_runs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "agent_runs_insert_self" on public.agent_runs
  for insert to authenticated with check (user_id is null or user_id = auth.uid());

create index agent_runs_run_id_idx on public.agent_runs(run_id);
create index agent_runs_agent_idx on public.agent_runs(agent, created_at desc);