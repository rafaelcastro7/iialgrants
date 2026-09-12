alter table public.discovery_sources_registry
  add column if not exists owner_label text,
  add column if not exists recovery_playbook text,
  add column if not exists expected_refresh_hours integer,
  add column if not exists coverage_dimensions text[] not null default '{}'::text[];

update public.discovery_sources_registry
set
  owner_label = coalesce(owner_label, 'Grant operations administrator'),
  recovery_playbook = coalesce(
    recovery_playbook,
    'Inspect the latest source_ingest_runs error, verify the official URL and format, rerun this tier, then disable with a note if the source is retired.'
  ),
  expected_refresh_hours = coalesce(
    expected_refresh_hours,
    case tier
      when 'A_daily' then 36
      when 'B_weekly' then 192
      when 'C_monthly' then 840
      else 192
    end
  ),
  coverage_dimensions = case
    when cardinality(coverage_dimensions) > 0 then coverage_dimensions
    when dataset_key in ('tbs_gc', 'grants_gov') then array['government', 'national']
    when dataset_key in ('t3010_charities', 'pfc_members') then array['foundation', 'national']
    when dataset_key in ('otf_open', 'alberta_ckan') then array['provincial']
    else array['multi-sector']
  end;

alter table public.discovery_sources_registry
  alter column owner_label set not null,
  alter column recovery_playbook set not null,
  alter column expected_refresh_hours set not null,
  add constraint discovery_sources_refresh_hours_check
    check (expected_refresh_hours between 1 and 8760);

create or replace view public.source_coverage_accountability
with (security_invoker = true) as
select
  r.id,
  r.dataset_key,
  r.label,
  r.tier,
  r.enabled,
  r.owner_label,
  r.recovery_playbook,
  r.expected_refresh_hours,
  r.coverage_dimensions,
  r.last_run_at,
  r.last_status,
  r.last_error,
  case
    when not r.enabled then 'disabled'
    when r.last_run_at is null then 'never_run'
    when r.last_status = 'failed' then 'failed'
    when r.last_run_at < now() - make_interval(hours => r.expected_refresh_hours) then 'overdue'
    else 'healthy'
  end as accountable_state,
  case
    when r.last_run_at is null then null
    else extract(epoch from (now() - r.last_run_at)) / 3600
  end as age_hours
from public.discovery_sources_registry r;

grant select on public.source_coverage_accountability to authenticated;

