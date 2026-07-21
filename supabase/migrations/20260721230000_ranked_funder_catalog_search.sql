-- Ranked funder search: mirrors 20260721193000_ranked_grant_catalog_search.sql
-- but for the funders catalog. searchFunders() previously paginated an
-- ilike-filtered, name-ordered query and only re-scored/re-sorted within
-- that one page client-side — a relevant funder past the page window was
-- silently dropped, not just ranked lower. It also never used the
-- funders_name_trgm_idx trigram index the grant-search migration already
-- created, so it had no typo tolerance unlike /grants.

create index if not exists funders_legal_name_trgm_idx
  on public.funders using gin (lower(legal_name) extensions.gin_trgm_ops);

create index if not exists funders_city_trgm_idx
  on public.funders using gin (lower(city) extensions.gin_trgm_ops);

create or replace function public.search_funder_catalog(
  search_query text,
  result_limit integer default 500
)
returns table (funder_id uuid, relevance double precision, matched_on text)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select trim(search_query) as raw_query
  ), scored as (
    select
      f.id as funder_id,
      greatest(
        extensions.word_similarity(lower(input.raw_query), lower(f.name)),
        extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.legal_name, ''))) * 0.9,
        extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.city, ''))) * 0.5
      )::double precision as fuzzy_score,
      case
        when lower(f.name) = lower(input.raw_query) then 1.0
        when lower(f.name) like lower(input.raw_query) || '%' then 0.8
        when lower(f.name) like '%' || lower(input.raw_query) || '%' then 0.6
        when lower(coalesce(f.legal_name, '')) like '%' || lower(input.raw_query) || '%' then 0.5
        when lower(coalesce(f.city, '')) like '%' || lower(input.raw_query) || '%' then 0.3
        else 0.0
      end::double precision as exact_score,
      case
        when lower(f.name) like '%' || lower(input.raw_query) || '%' then 'name'
        when lower(coalesce(f.legal_name, '')) like '%' || lower(input.raw_query) || '%' then 'legal_name'
        when lower(coalesce(f.city, '')) like '%' || lower(input.raw_query) || '%' then 'city'
        when extensions.word_similarity(lower(input.raw_query), lower(f.name)) >= 0.3 then 'name (fuzzy)'
        else 'related'
      end as matched_on
    from public.funders f
    cross join input
    where input.raw_query <> '' and (
      lower(f.name) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.legal_name, '')) like '%' || lower(input.raw_query) || '%'
      or lower(coalesce(f.city, '')) like '%' || lower(input.raw_query) || '%'
      or extensions.word_similarity(lower(input.raw_query), lower(f.name)) >= 0.3
      or extensions.word_similarity(lower(input.raw_query), lower(coalesce(f.legal_name, ''))) >= 0.3
    )
  )
  select
    scored.funder_id,
    (scored.exact_score * 0.6 + scored.fuzzy_score * 0.4) as relevance,
    scored.matched_on
  from scored
  order by relevance desc
  limit least(greatest(result_limit, 1), 500);
$$;

revoke all on function public.search_funder_catalog(text, integer) from public, anon;
grant execute on function public.search_funder_catalog(text, integer) to authenticated, service_role;
