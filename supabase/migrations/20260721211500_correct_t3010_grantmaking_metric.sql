-- Line 5100 is total expenditures, not grantmaking. Remove machine-generated
-- candidate evidence derived from that legacy metric before re-ingesting with
-- line 5050 (gifts to qualified donees). Human-approved/rejected rows are kept.
delete from public.funder_candidates
where status in ('candidate', 'pending_review')
  and source_signals = array['t3010_charities']::text[]
  and coalesce(raw_metadata->>'financial_metric', '') = '';

with corrected as (
  select
    id,
    array(
      select signal
      from unnest(source_signals) as signal
      where signal <> 't3010_charities'
      order by signal
    ) as signals
  from public.funder_candidates
  where status in ('candidate', 'pending_review')
    and source_signals @> array['t3010_charities']::text[]
    and coalesce(raw_metadata->>'financial_metric', '') = ''
)
update public.funder_candidates candidate
set
  source_signals = corrected.signals,
  disbursed_annual = null,
  score =
    (case when candidate.bn_number ~ '^[0-9]{9}' then 25 else 0 end) +
    (case when candidate.website is not null and candidate.website <> '' then 15 else 0 end) +
    (case when cardinality(corrected.signals) >= 2 then 10 else 0 end) +
    (case when candidate.province is not null and candidate.province <> '' then 5 else 0 end) +
    (case when candidate.funder_type is not null and candidate.funder_type <> '' then 5 else 0 end) +
    (case when candidate.province ~* '^(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)$' then 5 else 0 end),
  status = 'candidate',
  raw_metadata = candidate.raw_metadata - 'financial_metric'
from corrected
where corrected.id = candidate.id;

update public.discovery_sources_registry
set notes = 'Public/private foundations granting more than $500k via CRA T3010 line 5050 (gifts to qualified donees)'
where dataset_key = 't3010_charities';

-- Keep workflow state consistent with the repaired score for any surviving
-- candidate that retained useful evidence from another source.
update public.funder_candidates
set status = case when score >= 40 then 'pending_review' else 'candidate' end
where status in ('candidate', 'pending_review');
