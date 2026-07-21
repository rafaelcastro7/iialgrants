-- Preserve financial evidence used by candidate scoring and normalize BBF's
-- repeated program observations to one independent source signal.
alter table public.funder_candidates
  add column if not exists disbursed_annual numeric;

with normalized as (
  select
    id,
    array(
      select distinct
        case
          when signal like 'bbf:%' then 'bbf_programs'
          when signal like 'tbs_gc:%' then 'tbs_gc'
          when signal like 'funder_scout:%' then 'funder_scout'
          else signal
        end
      from unnest(source_signals) as signal
      where signal <> 'federal_research'
      order by 1
    ) as signals
  from public.funder_candidates
)
update public.funder_candidates candidate
set source_signals = normalized.signals
from normalized
where normalized.id = candidate.id
  and normalized.signals is distinct from candidate.source_signals;

-- Recalculate only machine-held/review rows. Human approved/rejected decisions
-- are never rewritten by maintenance migrations.
update public.funder_candidates
set
  score = least(
    100,
    (case when bn_number ~ '^[0-9]{9}' then 25 else 0 end) +
    (case when disbursed_annual > 0 then 20 else 0 end) +
    (case when website is not null and website <> '' then 15 else 0 end) +
    (case when cardinality(source_signals) >= 2 then 10 else 0 end) +
    (case when province is not null and province <> '' then 5 else 0 end) +
    (case when funder_type is not null and funder_type <> '' then 5 else 0 end) +
    (case when province ~* '^(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)$' then 5 else 0 end)
  ),
  status = case
    when least(
      100,
      (case when bn_number ~ '^[0-9]{9}' then 25 else 0 end) +
      (case when disbursed_annual > 0 then 20 else 0 end) +
      (case when website is not null and website <> '' then 15 else 0 end) +
      (case when cardinality(source_signals) >= 2 then 10 else 0 end) +
      (case when province is not null and province <> '' then 5 else 0 end) +
      (case when funder_type is not null and funder_type <> '' then 5 else 0 end) +
      (case when province ~* '^(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)$' then 5 else 0 end)
    ) >= 40 then 'pending_review'
    else 'candidate'
  end
where status in ('candidate', 'pending_review');
