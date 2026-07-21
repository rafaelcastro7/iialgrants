-- Search the complete grant catalog with indexed lexical retrieval and typo tolerance.
-- This replaces browser-side filtering of only the first 100 rows.

create index if not exists grants_catalog_fts_idx
  on public.grants using gin (
    (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(title_fr, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(summary_fr, '')), 'B')
    )
  );

create index if not exists grants_title_trgm_idx
  on public.grants using gin (lower(title) extensions.gin_trgm_ops);

create index if not exists funders_name_trgm_idx
  on public.funders using gin (lower(name) extensions.gin_trgm_ops);

create or replace function public.search_grant_catalog(
  search_query text,
  result_limit integer default 100
)
returns table (grant_id uuid, relevance double precision, matched_on text)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      trim(search_query) as raw_query,
      pg_catalog.websearch_to_tsquery('simple', trim(search_query)) as parsed_query
  ), scored as (
    select
      g.id as grant_id,
      pg_catalog.ts_rank_cd(
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.title, '')), 'A') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.title_fr, '')), 'A') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary, '')), 'B') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary_fr, '')), 'B'),
        input.parsed_query,
        32
      )::double precision as lexical_score,
      greatest(
        extensions.word_similarity(lower(input.raw_query), lower(g.title)),
        extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.name, ''))) * 0.7
      )::double precision as fuzzy_score,
      case
        when lower(g.title) = lower(input.raw_query) then 1.0
        when lower(g.title) like lower(input.raw_query) || '%' then 0.7
        when lower(g.title) like '%' || lower(input.raw_query) || '%' then 0.5
        when lower(coalesce(f.name, '')) like '%' || lower(input.raw_query) || '%' then 0.4
        else 0.0
      end::double precision as exact_score,
      case
        when lower(g.title) like '%' || lower(input.raw_query) || '%' then 'title'
        when lower(coalesce(f.name, '')) like '%' || lower(input.raw_query) || '%' then 'funder'
        when pg_catalog.to_tsvector('simple', coalesce(g.summary, '') || ' ' || coalesce(g.summary_fr, '')) @@ input.parsed_query then 'summary'
        when extensions.word_similarity(lower(input.raw_query), lower(g.title)) >= 0.35 then 'title (fuzzy)'
        when extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.name, ''))) >= 0.35 then 'funder (fuzzy)'
        else 'related terms'
      end as matched_on,
      coalesce(g.fit_score, 0) as fit_score,
      g.deadline
    from public.grants g
    left join public.funders f on f.id = g.funder_id
    cross join input
    where input.raw_query <> '' and (
      (
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.title, '')), 'A') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.title_fr, '')), 'A') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary, '')), 'B') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary_fr, '')), 'B')
      ) @@ input.parsed_query
      or extensions.word_similarity(lower(input.raw_query), lower(g.title)) >= 0.35
      or extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.name, ''))) >= 0.35
      or lower(g.title) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.name, '')) like '%' || lower(input.raw_query) || '%'
    )
  )
  select
    scored.grant_id,
    (scored.exact_score * 0.50 + least(scored.lexical_score, 1.0) * 0.35 + scored.fuzzy_score * 0.15) as relevance,
    scored.matched_on
  from scored
  order by relevance desc, scored.fit_score desc, scored.deadline asc nulls last
  limit least(greatest(result_limit, 1), 100);
$$;

revoke all on function public.search_grant_catalog(text, integer) from public, anon;
grant execute on function public.search_grant_catalog(text, integer) to authenticated, service_role;
