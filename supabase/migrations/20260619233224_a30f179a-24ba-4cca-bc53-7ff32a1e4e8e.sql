
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
language sql stable security invoker
-- must include `extensions`: the pgvector `<=>` operator lives there, and a
-- bare `search_path = public` makes it unresolvable inside the function body.
set search_path = public, extensions
as $$
  select k.id, k.content, k.source, k.language,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks k
  where k.user_id = match_user_id and k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
revoke all on function public.match_knowledge_chunks(vector, uuid, int) from public, anon;
grant execute on function public.match_knowledge_chunks(vector, uuid, int) to authenticated, service_role;
