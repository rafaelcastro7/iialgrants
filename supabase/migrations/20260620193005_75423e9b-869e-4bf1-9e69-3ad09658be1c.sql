
create table if not exists public.agent_configs (
  agent text primary key,
  model text not null default 'google/gemini-2.5-flash',
  fallback_model text,
  temperature numeric not null default 0.2,
  top_p numeric not null default 1.0,
  max_output_tokens integer not null default 2048,
  json_mode boolean not null default true,
  system_prompt text,
  prompt_version text not null default '1.0.0',
  timeout_ms integer not null default 60000,
  max_retries integer not null default 2,
  concurrency integer not null default 4,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

grant select, update on public.agent_configs to authenticated;
grant all on public.agent_configs to service_role;

alter table public.agent_configs enable row level security;

create policy "agent_configs_select_all_auth"
  on public.agent_configs for select to authenticated using (true);

create policy "agent_configs_update_admin"
  on public.agent_configs for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists agent_configs_set_updated_at on public.agent_configs;
create trigger agent_configs_set_updated_at
  before update on public.agent_configs
  for each row execute function public.set_updated_at();

insert into public.agent_configs (agent, model, fallback_model, temperature, max_output_tokens, json_mode, prompt_version)
values
  ('discoverer', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 0.1, 4096, true, '1.0.0'),
  ('enricher',   'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 0.1, 2048, true, '2.0.0'),
  ('evaluator',  'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 0.2, 1024, true, '1.0.0'),
  ('strategist', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 0.3, 2048, true, '1.1.0'),
  ('writer',     'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 0.4, 3000, true, '1.1.0'),
  ('critic',     'google/gemini-2.5-pro',   'google/gemini-2.5-flash', 0.2, 2048, true, '1.1.0')
on conflict (agent) do nothing;
