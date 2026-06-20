
-- Split "modules" (product domains) from "agents" (LLM workers).

-- 1) Agents flags table
create table if not exists public.agent_flags (
  agent text primary key,
  enabled boolean not null default true,
  description text not null default '',
  description_fr text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select on public.agent_flags to authenticated;
grant all on public.agent_flags to service_role;

alter table public.agent_flags enable row level security;

create policy "agent_flags: authenticated can read"
  on public.agent_flags for select to authenticated using (true);

create policy "agent_flags: admin can update"
  on public.agent_flags for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "agent_flags: admin can insert"
  on public.agent_flags for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create trigger agent_flags_set_updated_at
  before update on public.agent_flags
  for each row execute function public.set_updated_at();

insert into public.agent_flags (agent, enabled, description, description_fr) values
  ('discoverer', true, 'Discovers Canadian grant opportunities',   'Découvre les opportunités de subventions canadiennes'),
  ('enricher',   true, 'Enriches grant metadata via web/RAG',      'Enrichit les métadonnées des subventions via web/RAG'),
  ('evaluator',  true, 'Scores grant fit vs. org profile',         'Évalue la pertinence subvention vs. profil org'),
  ('strategist', true, 'Plans proposal strategy and outline',      'Planifie la stratégie et la structure de la proposition'),
  ('writer',     true, 'Drafts proposal sections',                 'Rédige les sections de la proposition'),
  ('critic',     true, 'Reviews drafts for compliance & quality',  'Revoit les brouillons (conformité et qualité)')
on conflict (agent) do nothing;

-- 2) Reset module_flags to real product modules (domains), not agents
delete from public.module_flags
  where module in ('evaluator','strategist','writer','critic','grants_discovery','rag_org_profile');

insert into public.module_flags (module, enabled, description, description_fr) values
  ('grants',          true, 'Grants discovery and catalog',               'Découverte et catalogue de subventions'),
  ('proposals',       true, 'Proposal drafting workspace',                'Espace de rédaction de propositions'),
  ('submissions',     true, 'Submission packaging and tracking',          'Conditionnement et suivi des soumissions'),
  ('org_profile',     true, 'Organization profile and RAG knowledge',     'Profil de l''organisation et base RAG'),
  ('analytics',       true, 'Operational metrics and dashboards',         'Métriques opérationnelles et tableaux de bord'),
  ('public_webhooks', true, 'Public webhook endpoints',                   'Points de terminaison webhook publics')
on conflict (module) do update set
  description = excluded.description,
  description_fr = excluded.description_fr;
