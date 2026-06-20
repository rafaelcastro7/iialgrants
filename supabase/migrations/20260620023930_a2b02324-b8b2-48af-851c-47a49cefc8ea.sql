
create table if not exists public.module_flags (
  module text primary key,
  enabled boolean not null default true,
  description text not null default '',
  description_fr text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select on public.module_flags to authenticated;
grant all on public.module_flags to service_role;

alter table public.module_flags enable row level security;

create policy "module_flags: authenticated can read"
  on public.module_flags for select
  to authenticated
  using (true);

create policy "module_flags: admin can update"
  on public.module_flags for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "module_flags: admin can insert"
  on public.module_flags for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create trigger module_flags_set_updated_at
  before update on public.module_flags
  for each row execute function public.set_updated_at();

insert into public.module_flags (module, enabled, description, description_fr) values
  ('grants_discovery', true, 'Automated grant discovery agent', 'Agent de découverte automatique de subventions'),
  ('evaluator',        true, 'AI fit-score evaluator',          'Évaluateur de pertinence par IA'),
  ('strategist',       true, 'Proposal strategist agent',       'Agent stratège de propositions'),
  ('writer',           true, 'Proposal writer agent',           'Agent rédacteur de propositions'),
  ('critic',           true, 'Critic agent (compliance)',       'Agent critique (conformité)'),
  ('submissions',      true, 'Submission packaging & tracking', 'Conditionnement et suivi des soumissions'),
  ('rag_org_profile',  true, 'Org profile RAG sync',            'Synchronisation RAG du profil org'),
  ('public_webhooks',  true, 'Public webhook endpoints',        'Points de terminaison webhook publics')
on conflict (module) do nothing;
