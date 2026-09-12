-- Phase 3 grant facets. All columns are nullable on purpose: NULL means that
-- the source has not established the fact. An empty array is a grounded claim
-- of no applicable values and must not be used as the default for legacy rows.
alter table public.grants
  add column if not exists applicant_types text[],
  add column if not exists populations_served text[],
  add column if not exists funding_uses text[],
  add column if not exists funder_type text,
  add column if not exists deadline_kind text,
  add column if not exists deadline_confidence numeric(3,2),
  add column if not exists next_expected_open date,
  add column if not exists next_expected_deadline date,
  add column if not exists source_freshness_at timestamptz,
  add column if not exists source_confidence numeric(3,2);

alter table public.grants
  drop constraint if exists grants_deadline_kind_check,
  add constraint grants_deadline_kind_check check (
    deadline_kind is null or deadline_kind in ('confirmed', 'predicted', 'rolling', 'closed', 'unknown')
  ),
  drop constraint if exists grants_deadline_confidence_check,
  add constraint grants_deadline_confidence_check check (
    deadline_confidence is null or deadline_confidence between 0 and 1
  ),
  drop constraint if exists grants_source_confidence_check,
  add constraint grants_source_confidence_check check (
    source_confidence is null or source_confidence between 0 and 1
  ),
  drop constraint if exists grants_predicted_deadline_not_confirmed_check,
  add constraint grants_predicted_deadline_not_confirmed_check check (
    deadline_kind <> 'predicted' or deadline is null
  );

create index if not exists grants_applicant_types_gin on public.grants using gin(applicant_types);
create index if not exists grants_populations_served_gin on public.grants using gin(populations_served);
create index if not exists grants_funding_uses_gin on public.grants using gin(funding_uses);
create index if not exists grants_funder_type_idx on public.grants(funder_type);
create index if not exists grants_deadline_kind_idx on public.grants(deadline_kind);

comment on column public.grants.deadline is
  'Confirmed source-backed deadline only. Predicted dates belong in next_expected_deadline.';
comment on column public.grants.deadline_kind is
  'confirmed, predicted, rolling, closed, or unknown; NULL means not yet classified.';
