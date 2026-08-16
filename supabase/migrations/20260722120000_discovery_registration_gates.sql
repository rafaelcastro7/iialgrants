-- Tracks funder pages that gate content behind login/registration so they are
-- surfaced for a human to sign up manually, instead of being silently lost as
-- an indistinguishable "fetch failed" / "too short" discovery skip. This
-- system never creates accounts on external sites — detection + tracking
-- only; a human decides whether and how to register.
create table public.discovery_registration_gates (
  id uuid primary key default gen_random_uuid(),
  funder_id uuid references public.funders(id) on delete cascade,
  url text not null,
  reason text not null,
  snippet text,
  status text not null default 'pending' check (status in ('pending', 'registered', 'not_needed')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  times_seen integer not null default 1,
  resolved_at timestamptz,
  resolved_note text,
  unique (funder_id, url)
);

create index discovery_registration_gates_status_idx
  on public.discovery_registration_gates(status);

alter table public.discovery_registration_gates enable row level security;

create policy discovery_registration_gates_authenticated_select
  on public.discovery_registration_gates
  for select to authenticated using (true);

create policy discovery_registration_gates_admin_write
  on public.discovery_registration_gates
  for all to authenticated
  using (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ));

grant select on public.discovery_registration_gates to authenticated;
grant all on public.discovery_registration_gates to service_role;
