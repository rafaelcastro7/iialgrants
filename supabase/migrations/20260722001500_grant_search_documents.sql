-- Canonical, locally embedded grant documents for bilingual semantic retrieval.
create table public.grant_search_documents (
  grant_id uuid primary key references public.grants(id) on delete cascade,
  content_en text not null,
  content_fr text not null default '',
  content_hash text not null,
  embedding extensions.vector(768),
  embedding_model text,
  embedded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index grant_search_documents_embedding_hnsw
  on public.grant_search_documents using hnsw (embedding extensions.vector_cosine_ops);
create index grant_search_documents_hash_idx on public.grant_search_documents(content_hash);

alter table public.grant_search_documents enable row level security;
create policy grant_search_documents_authenticated_select on public.grant_search_documents
  for select to authenticated using (true);
grant select on public.grant_search_documents to authenticated;
grant all on public.grant_search_documents to service_role;

create trigger grant_search_documents_set_updated_at
  before update on public.grant_search_documents
  for each row execute function public.set_updated_at();

create or replace function public.match_grant_search_documents(
  query_embedding extensions.vector(768),
  match_threshold double precision default 0.35,
  match_count integer default 100
)
returns table (grant_id uuid, semantic_similarity double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.grant_id,
    (1 - (d.embedding OPERATOR(extensions.<=>) query_embedding))::double precision as semantic_similarity
  from public.grant_search_documents d
  join public.grants g on g.id = d.grant_id
  where d.embedding is not null
    and g.status not in ('archived', 'expired', 'lost')
    and 1 - (d.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
  order by d.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 100);
$$;

revoke all on function public.match_grant_search_documents(
  extensions.vector,double precision,integer
) from public, anon;
grant execute on function public.match_grant_search_documents(
  extensions.vector,double precision,integer
) to authenticated, service_role;
