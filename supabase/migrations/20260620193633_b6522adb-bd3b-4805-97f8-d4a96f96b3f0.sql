
create table if not exists public.agent_config_audit (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  user_id uuid,
  changed_at timestamptz not null default now(),
  field text not null,
  old_value jsonb,
  new_value jsonb,
  is_prompt boolean not null default false
);

create index if not exists agent_config_audit_agent_idx
  on public.agent_config_audit (agent, changed_at desc);

grant select on public.agent_config_audit to authenticated;
grant all on public.agent_config_audit to service_role;

alter table public.agent_config_audit enable row level security;

create policy "agent_config_audit_select_auth"
  on public.agent_config_audit for select to authenticated using (true);
