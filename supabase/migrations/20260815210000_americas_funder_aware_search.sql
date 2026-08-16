-- Make catalog search funder-aware across the Americas.
--
-- Two defects this fixes:
--
-- 1. Substring false positives. Both catalog RPCs matched with
--    `lower(col) LIKE '%' || q || '%'`, so a short acronym matched inside
--    unrelated words: query "nsf" returned "Technological Tra(nsf)ormation"
--    and "The Quebec Business Tra(nsf)er Fund". Short queries now require a
--    word-boundary match; longer queries keep substring behaviour, which is
--    what makes partial program names ("canexport") still work.
--
-- 2. Geography was unsearchable. funders carries country / jurisdiction /
--    category for all 104 rows (US federal agencies, Pan-American
--    multilaterals, LatAm science councils), but neither RPC looked at those
--    columns — so "brazil", "pan-american" or "us private foundation"
--    matched nothing, and grants could never be reached through their
--    funder's geography.

-- Word-boundary aware containment. Postgres \m and \M are word boundaries.
create or replace function public.search_term_matches(haystack text, needle text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when coalesce(haystack, '') = '' or coalesce(needle, '') = '' then false
    -- Acronyms and other short tokens: whole-word match only.
    when length(needle) <= 4
      then lower(haystack) ~ ('\m' || regexp_replace(lower(needle), '([\.\*\+\?\(\)\[\]\{\}\|\\\^\$])', '\\\1', 'g') || '\M')
    else lower(haystack) like '%' || lower(needle) || '%'
  end;
$$;

comment on function public.search_term_matches(text, text) is
  'Containment test that requires a whole-word match for short queries, so acronyms like NSF do not match inside "transfer".';

-- ---------------------------------------------------------------------------
-- Grant catalog: match the grant, and the geography of the funder behind it.
-- ---------------------------------------------------------------------------
create or replace function public.search_grant_catalog(search_query text, result_limit integer default 100)
returns table(grant_id uuid, relevance double precision, matched_on text)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id,
    (case
      when lower(g.title) = lower(search_query) then 1.0
      when lower(g.title) like lower(search_query) || '%' then 0.7
      when public.search_term_matches(g.title, search_query) then 0.5
      when public.search_term_matches(f.name, search_query) then 0.45
      when public.search_term_matches(f.legal_name, search_query) then 0.4
      when public.search_term_matches(g.summary, search_query) then 0.3
      when public.search_term_matches(f.jurisdiction, search_query) then 0.25
      when public.search_term_matches(f.country, search_query) then 0.22
      when public.search_term_matches(f.category, search_query) then 0.2
      else 0.0
    end)::double precision,
    (case
      when public.search_term_matches(g.title, search_query) then 'title'
      when public.search_term_matches(f.name, search_query)
        or public.search_term_matches(f.legal_name, search_query) then 'funder'
      when public.search_term_matches(g.summary, search_query) then 'summary'
      when public.search_term_matches(f.jurisdiction, search_query)
        or public.search_term_matches(f.country, search_query) then 'funder jurisdiction'
      when public.search_term_matches(f.category, search_query) then 'funder category'
      else 'related'
    end)
  from public.grants g
  left join public.funders f on f.id = g.funder_id
  where trim(search_query) <> '' and (
    public.search_term_matches(g.title, search_query)
    or public.search_term_matches(g.summary, search_query)
    or public.search_term_matches(f.name, search_query)
    or public.search_term_matches(f.legal_name, search_query)
    or public.search_term_matches(f.jurisdiction, search_query)
    or public.search_term_matches(f.country, search_query)
    or public.search_term_matches(f.category, search_query)
  )
  order by 2 desc, g.fit_score desc nulls last
  limit least(greatest(result_limit, 1), 100);
$$;

revoke all on function public.search_grant_catalog(text, integer) from public, anon;
grant execute on function public.search_grant_catalog(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Funder catalog: name/legal_name/city plus country, jurisdiction, category.
-- ---------------------------------------------------------------------------
create or replace function public.search_funder_catalog(search_query text, result_limit integer default 500)
returns table(funder_id uuid, relevance double precision, matched_on text)
language sql
stable
security invoker
set search_path = ''
as $$
  with scored as (
    select
      f.id as funder_id,
      greatest(
        extensions.word_similarity(lower(trim(search_query)), lower(f.name)),
        extensions.word_similarity(lower(trim(search_query)), lower(coalesce(f.legal_name, ''))) * 0.9
      )::double precision as fuzzy_score,
      (case
        when lower(f.name) = lower(trim(search_query)) then 1.0
        when lower(f.name) like lower(trim(search_query)) || '%' then 0.8
        when public.search_term_matches(f.name, trim(search_query)) then 0.6
        when public.search_term_matches(f.legal_name, trim(search_query)) then 0.5
        when public.search_term_matches(f.jurisdiction, trim(search_query)) then 0.45
        when public.search_term_matches(f.country, trim(search_query)) then 0.4
        when public.search_term_matches(f.category, trim(search_query)) then 0.35
        when public.search_term_matches(f.city, trim(search_query)) then 0.3
        when public.search_term_matches(f.province, trim(search_query)) then 0.3
        else 0.0
      end)::double precision as exact_score,
      (case
        when public.search_term_matches(f.name, trim(search_query)) then 'name'
        when public.search_term_matches(f.legal_name, trim(search_query)) then 'legal_name'
        when public.search_term_matches(f.jurisdiction, trim(search_query)) then 'jurisdiction'
        when public.search_term_matches(f.country, trim(search_query)) then 'country'
        when public.search_term_matches(f.category, trim(search_query)) then 'category'
        when public.search_term_matches(f.city, trim(search_query)) then 'city'
        when public.search_term_matches(f.province, trim(search_query)) then 'province'
        when extensions.word_similarity(lower(trim(search_query)), lower(f.name)) >= 0.3 then 'name (fuzzy)'
        else 'related'
      end) as matched_on
    from public.funders f
    where trim(search_query) <> ''
  )
  select scored.funder_id,
         greatest(scored.exact_score, scored.fuzzy_score) as relevance,
         scored.matched_on
  from scored
  where scored.exact_score > 0 or scored.fuzzy_score >= 0.3
  order by 2 desc
  limit least(greatest(result_limit, 1), 500);
$$;

revoke all on function public.search_funder_catalog(text, integer) from public, anon;
grant execute on function public.search_funder_catalog(text, integer) to authenticated, service_role;

-- Geography filters are now first-class in the funder directory UI.
create index if not exists funders_country_idx on public.funders (country);
create index if not exists funders_jurisdiction_idx on public.funders (jurisdiction);
