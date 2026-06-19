
create extension if not exists vector;

do $$ begin
  create type public.proposal_status as enum ('draft','in_review','submitted','accepted','rejected','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.section_kind as enum ('summary','problem','solution','impact','budget','team','timeline','sustainability','evaluation','other');
exception when duplicate_object then null; end $$;

create table public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  name_fr text,
  description text,
  sections jsonb not null default '[]'::jsonb,
  is_global boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.proposal_templates to authenticated;
grant all on public.proposal_templates to service_role;
alter table public.proposal_templates enable row level security;
create policy "view templates" on public.proposal_templates for select to authenticated
  using (is_global = true or owner_id = auth.uid());
create policy "manage own templates" on public.proposal_templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_proposal_templates_updated before update on public.proposal_templates
  for each row execute function public.set_updated_at();

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_kind text not null default 'org_profile',
  language public.app_lang not null default 'en',
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.knowledge_chunks to authenticated;
grant all on public.knowledge_chunks to service_role;
alter table public.knowledge_chunks enable row level security;
create policy "own chunks" on public.knowledge_chunks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index knowledge_chunks_user_idx on public.knowledge_chunks(user_id);
create index knowledge_chunks_content_fts on public.knowledge_chunks
  using gin (to_tsvector('simple', content));
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  template_id uuid references public.proposal_templates(id) on delete set null,
  title text not null,
  status public.proposal_status not null default 'draft',
  version integer not null default 1,
  language public.app_lang not null default 'en',
  critic_score numeric(3,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.proposals to authenticated;
grant all on public.proposals to service_role;
alter table public.proposals enable row level security;
create policy "own proposals" on public.proposals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index proposals_user_idx on public.proposals(user_id);
create index proposals_grant_idx on public.proposals(grant_id);
create trigger trg_proposals_updated before update on public.proposals
  for each row execute function public.set_updated_at();

create table public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.section_kind not null,
  ord integer not null default 0,
  heading_en text not null,
  heading_fr text,
  content_en text not null default '',
  content_fr text,
  citations jsonb not null default '[]'::jsonb,
  critic_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.proposal_sections to authenticated;
grant all on public.proposal_sections to service_role;
alter table public.proposal_sections enable row level security;
create policy "own sections" on public.proposal_sections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index proposal_sections_proposal_idx on public.proposal_sections(proposal_id);
create trigger trg_proposal_sections_updated before update on public.proposal_sections
  for each row execute function public.set_updated_at();

create table public.proposal_citations (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.proposal_sections(id) on delete cascade,
  chunk_id uuid not null references public.knowledge_chunks(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  marker text not null,
  snippet text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.proposal_citations to authenticated;
grant all on public.proposal_citations to service_role;
alter table public.proposal_citations enable row level security;
create policy "own citations select" on public.proposal_citations for select to authenticated
  using (user_id = auth.uid());
create policy "own citations insert" on public.proposal_citations for insert to authenticated
  with check (user_id = auth.uid());
create index proposal_citations_section_idx on public.proposal_citations(section_id);

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  content text,
  source text,
  language public.app_lang,
  similarity float
)
language sql stable security definer
set search_path = public
as $$
  select k.id, k.content, k.source, k.language,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks k
  where k.user_id = match_user_id and k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
revoke all on function public.match_knowledge_chunks(vector, uuid, int) from public;
grant execute on function public.match_knowledge_chunks(vector, uuid, int) to authenticated, service_role;

insert into public.proposal_templates (owner_id, name, name_fr, description, sections, is_global)
values (null, 'Standard Canadian Grant', 'Subvention canadienne standard',
  'Default template covering the sections required by most federal/provincial grant programs.',
  '[
    {"kind":"summary","heading_en":"Executive Summary","heading_fr":"Résumé"},
    {"kind":"problem","heading_en":"Problem Statement","heading_fr":"Énoncé du problème"},
    {"kind":"solution","heading_en":"Proposed Solution","heading_fr":"Solution proposée"},
    {"kind":"impact","heading_en":"Expected Impact","heading_fr":"Impact attendu"},
    {"kind":"budget","heading_en":"Budget","heading_fr":"Budget"},
    {"kind":"team","heading_en":"Team","heading_fr":"Équipe"},
    {"kind":"timeline","heading_en":"Timeline","heading_fr":"Calendrier"},
    {"kind":"sustainability","heading_en":"Sustainability","heading_fr":"Durabilité"},
    {"kind":"evaluation","heading_en":"Evaluation Plan","heading_fr":"Plan d''évaluation"}
  ]'::jsonb,
  true);
