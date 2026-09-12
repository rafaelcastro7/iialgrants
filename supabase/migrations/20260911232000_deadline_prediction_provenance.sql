alter table public.grants
  add column if not exists next_expected_deadline_confidence numeric(3,2),
  add column if not exists next_expected_deadline_basis text;

alter table public.grants
  drop constraint if exists grants_next_expected_deadline_confidence_check,
  add constraint grants_next_expected_deadline_confidence_check check (
    next_expected_deadline_confidence is null or next_expected_deadline_confidence between 0 and 1
  ),
  drop constraint if exists grants_next_expected_deadline_basis_check,
  add constraint grants_next_expected_deadline_basis_check check (
    next_expected_deadline_basis is null or
    next_expected_deadline_basis in ('observed_cycles', 'explicit_cadence')
  );

