
create or replace function public.is_admin(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'admin');
$$;

create or replace view public.agent_runs_daily
with (security_invoker = true) as
select
  date_trunc('day', created_at)::date as day,
  agent,
  count(*) as runs,
  count(*) filter (where status = 'succeeded') as ok_runs,
  count(*) filter (where status = 'failed')    as error_runs,
  count(*) filter (where status = 'degraded')  as degraded_runs,
  coalesce(sum(input_tokens), 0)  as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  coalesce(sum(cost_usd), 0)::numeric(12,4) as cost_usd,
  percentile_cont(0.5)  within group (order by latency_ms)::int as p50_ms,
  percentile_cont(0.95) within group (order by latency_ms)::int as p95_ms
from public.agent_runs
where created_at > now() - interval '30 days'
group by 1, 2
order by 1 desc, 2;

revoke all on public.agent_runs_daily from public, anon;
grant select on public.agent_runs_daily to authenticated;
comment on view public.agent_runs_daily is 'Aggregated agent metrics. Underlying agent_runs RLS restricts non-admin access.';
