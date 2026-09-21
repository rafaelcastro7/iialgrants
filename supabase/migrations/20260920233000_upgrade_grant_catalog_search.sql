-- Upgrade Grant Catalog Search
-- Replaces rigid substring LIKE '%query%' with hybrid Full-Text Search (websearch_to_tsquery + ts_rank_cd)
-- and Trigram Fuzzy Word Similarity, restoring high-recall natural language search.

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
returns table(grant_id uuid, relevance double precision, matched_on text)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      trim(search_query) as raw_query,
      coalesce(
        nullif(pg_catalog.websearch_to_tsquery('simple', trim(search_query)), ''::tsquery),
        nullif(pg_catalog.plainto_tsquery('simple', trim(search_query)), ''::tsquery)
      ) as parsed_query
  ), scored as (
    select
      g.id as grant_id,
      (
        -- 1. Exact / Prefix / Substring title boosts
        case
          when lower(g.title) = lower(input.raw_query) then 1.0
          when lower(g.title) like lower(input.raw_query) || '%' then 0.75
          when lower(g.title) like '%' || lower(input.raw_query) || '%' then 0.55
          when lower(coalesce(f.name, '')) like '%' || lower(input.raw_query) || '%' then 0.4
          else 0.0
        end
        +
        -- 2. Full-text search density rank over title (A) and summary (B)
        case
          when input.parsed_query is not null then
            coalesce(
              pg_catalog.ts_rank_cd(
                setweight(pg_catalog.to_tsvector('simple', coalesce(g.title, '')), 'A') ||
                setweight(pg_catalog.to_tsvector('simple', coalesce(g.title_fr, '')), 'A') ||
                setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary, '')), 'B') ||
                setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary_fr, '')), 'B'),
                input.parsed_query,
                32
              ) * 0.45,
              0.0
            )
          else 0.0
        end
        +
        -- 3. Trigram word similarity for fuzzy typo tolerance
        coalesce(
          greatest(
            extensions.word_similarity(lower(input.raw_query), lower(g.title)),
            extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.name, ''))) * 0.7
          ) * 0.2,
          0.0
        )
        +
        -- 4. Funder geographic / categorical match
        case
          when lower(coalesce(f.jurisdiction, '')) like '%' || lower(input.raw_query) || '%'
            or lower(coalesce(f.country, '')) like '%' || lower(input.raw_query) || '%' then 0.2
          when lower(coalesce(f.category, '')) like '%' || lower(input.raw_query) || '%' then 0.15
          else 0.0
        end
      )::double precision as raw_score,
      (
        case
          when lower(g.title) = lower(input.raw_query) then 'title'
          when lower(g.title) like '%' || lower(input.raw_query) || '%' then 'title'
          when lower(coalesce(f.name, '')) like '%' || lower(input.raw_query) || '%'
            or lower(coalesce(f.legal_name, '')) like '%' || lower(input.raw_query) || '%' then 'funder'
          when input.parsed_query is not null and (
            setweight(pg_catalog.to_tsvector('simple', coalesce(g.title, '')), 'A') ||
            setweight(pg_catalog.to_tsvector('simple', coalesce(g.title_fr, '')), 'A')
          ) @@ input.parsed_query then 'title'
          when input.parsed_query is not null and (
            setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary, '')), 'B') ||
            setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary_fr, '')), 'B')
          ) @@ input.parsed_query then 'summary'
          when extensions.word_similarity(lower(input.raw_query), lower(g.title)) >= 0.35 then 'title (fuzzy)'
          when lower(coalesce(f.jurisdiction, '')) like '%' || lower(input.raw_query) || '%'
            or lower(coalesce(f.country, '')) like '%' || lower(input.raw_query) || '%' then 'funder jurisdiction'
          when lower(coalesce(f.category, '')) like '%' || lower(input.raw_query) || '%' then 'funder category'
          else 'related'
        end
      ) as matched_on,
      g.fit_score
    from public.grants g
    left join public.funders f on f.id = g.funder_id
    cross join input
    where trim(input.raw_query) <> '' and (
      -- Condition: Title / summary matches parsed FTS query
      (input.parsed_query is not null and (
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.title, '')), 'A') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.title_fr, '')), 'A') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary, '')), 'B') ||
        setweight(pg_catalog.to_tsvector('simple', coalesce(g.summary_fr, '')), 'B')
      ) @@ input.parsed_query)
      -- OR Substring in title or funder
      or lower(g.title) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.name, '')) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.legal_name, '')) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.jurisdiction, '')) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.country, '')) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.category, '')) like '%' || lower(input.raw_query) || '%'
      -- OR Trigram similarity threshold
      or extensions.word_similarity(lower(input.raw_query), lower(g.title)) >= 0.35
      or extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.name, ''))) >= 0.45
    )
  )
  select
    grant_id,
    least(1.0, greatest(0.01, raw_score))::double precision as relevance,
    matched_on
  from scored
  order by relevance desc, fit_score desc nulls last
  limit least(greatest(result_limit, 1), 100);
$$;

revoke all on function public.search_grant_catalog(text, integer) from public, anon;
grant execute on function public.search_grant_catalog(text, integer) to authenticated, service_role;
