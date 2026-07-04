-- Shareable fit reports (Grantable-style): a tokenized, read-only public view
-- of one grant's evaluation. The token is unguessable (32 hex chars); public
-- access goes exclusively through a server function using the service role and
-- validating token + expiry + revocation — the table itself is NOT publicly
-- readable.
create table if not exists public.shared_fit_reports (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked boolean not null default false
);

alter table public.shared_fit_reports enable row level security;

-- Owners manage their own share links; no anon/public policy on purpose.
drop policy if exists "shared_reports_owner_all" on public.shared_fit_reports;
create policy "shared_reports_owner_all" on public.shared_fit_reports
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.shared_fit_reports to authenticated;
grant all on public.shared_fit_reports to service_role;

create index if not exists shared_fit_reports_token_idx on public.shared_fit_reports(token);
