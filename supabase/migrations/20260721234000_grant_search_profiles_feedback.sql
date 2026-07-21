-- Project-specific grant search intent and reversible, auditable feedback.

create table public.grant_search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  mission text not null default '' check (char_length(mission) <= 4000),
  activities text[] not null default '{}',
  populations_served text[] not null default '{}',
  funding_uses text[] not null default '{}',
  sectors text[] not null default '{}',
  jurisdictions text[] not null default '{CA}',
  applicant_types text[] not null default '{}',
  amount_min_cad numeric(14,2) check (amount_min_cad is null or amount_min_cad >= 0),
  amount_max_cad numeric(14,2) check (amount_max_cad is null or amount_max_cad >= 0),
  project_start date,
  project_end date,
  role text not null default 'either' check (role in ('lead','partner','either')),
  required_terms text[] not null default '{}',
  excluded_terms text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_min_cad is null or amount_max_cad is null or amount_min_cad <= amount_max_cad),
  check (project_start is null or project_end is null or project_start <= project_end)
);

create index grant_search_profiles_user_active_idx
  on public.grant_search_profiles(user_id, active, updated_at desc);

create table public.grant_search_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.grant_search_profiles(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('saved','hidden','rejected','restored','pursued')),
  reason text check (reason is null or reason in (
    'applicant_type','jurisdiction','sector','population','funding_use','amount',
    'deadline','capacity','duplicate','not_a_grant','other'
  )),
  note text check (note is null or char_length(note) <= 2000),
  query_text text check (query_text is null or char_length(query_text) <= 500),
  rank_position integer check (rank_position is null or rank_position >= 1),
  score_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, grant_id, user_id)
);

create index grant_search_feedback_profile_action_idx
  on public.grant_search_feedback(profile_id, action, updated_at desc);

create table public.grant_search_feedback_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.grant_search_profiles(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('saved','hidden','rejected','restored','pursued')),
  reason text,
  note text,
  query_text text,
  rank_position integer,
  score_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index grant_search_feedback_events_profile_created_idx
  on public.grant_search_feedback_events(profile_id, created_at desc);

grant select, insert, update, delete on public.grant_search_profiles to authenticated;
grant select on public.grant_search_feedback, public.grant_search_feedback_events to authenticated;
grant all on public.grant_search_profiles, public.grant_search_feedback,
  public.grant_search_feedback_events to service_role;

alter table public.grant_search_profiles enable row level security;
alter table public.grant_search_feedback enable row level security;
alter table public.grant_search_feedback_events enable row level security;

create policy grant_search_profiles_self_all on public.grant_search_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy grant_search_profiles_admin_select on public.grant_search_profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy grant_search_feedback_self_select on public.grant_search_feedback
  for select to authenticated using (user_id = auth.uid());
create policy grant_search_feedback_events_self_select on public.grant_search_feedback_events
  for select to authenticated using (user_id = auth.uid());

create trigger grant_search_profiles_set_updated_at before update on public.grant_search_profiles
  for each row execute function public.set_updated_at();
create trigger grant_search_feedback_set_updated_at before update on public.grant_search_feedback
  for each row execute function public.set_updated_at();
create trigger grant_search_feedback_events_no_update before update on public.grant_search_feedback_events
  for each row execute function public.reject_audit_mutation();

create or replace function public.record_grant_search_feedback(
  p_profile_id uuid,
  p_grant_id uuid,
  p_action text,
  p_reason text default null,
  p_note text default null,
  p_query_text text default null,
  p_rank_position integer default null,
  p_score_snapshot jsonb default '{}'::jsonb
)
returns public.grant_search_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.grant_search_feedback;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.grant_search_profiles
    where id = p_profile_id and user_id = v_user_id
  ) then raise exception 'search_profile_not_found'; end if;
  if p_action not in ('saved','hidden','rejected','restored','pursued') then
    raise exception 'invalid_feedback_action';
  end if;

  insert into public.grant_search_feedback_events(
    profile_id, grant_id, user_id, action, reason, note, query_text,
    rank_position, score_snapshot
  ) values (
    p_profile_id, p_grant_id, v_user_id, p_action, p_reason, p_note,
    p_query_text, p_rank_position, coalesce(p_score_snapshot, '{}'::jsonb)
  );

  insert into public.grant_search_feedback(
    profile_id, grant_id, user_id, action, reason, note, query_text,
    rank_position, score_snapshot
  ) values (
    p_profile_id, p_grant_id, v_user_id, p_action, p_reason, p_note,
    p_query_text, p_rank_position, coalesce(p_score_snapshot, '{}'::jsonb)
  )
  on conflict (profile_id, grant_id, user_id) do update set
    action = excluded.action,
    reason = excluded.reason,
    note = excluded.note,
    query_text = excluded.query_text,
    rank_position = excluded.rank_position,
    score_snapshot = excluded.score_snapshot,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.record_grant_search_feedback(
  uuid,uuid,text,text,text,text,integer,jsonb
) from public, anon;
grant execute on function public.record_grant_search_feedback(
  uuid,uuid,text,text,text,text,integer,jsonb
) to authenticated, service_role;
