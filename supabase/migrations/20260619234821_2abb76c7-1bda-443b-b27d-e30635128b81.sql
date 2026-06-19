
-- Consent types
create type public.consent_type as enum (
  'terms_of_service',
  'privacy_policy',
  'ai_processing',
  'cross_border_transfer',
  'marketing'
);

create type public.consent_action as enum ('granted', 'revoked');

create type public.dsar_kind as enum ('access', 'export', 'delete', 'rectify');
create type public.dsar_status as enum ('pending', 'processing', 'completed', 'rejected');

-- 1. consent_ledger
create table public.consent_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type public.consent_type not null,
  action public.consent_action not null,
  policy_version text not null,
  language public.app_lang not null default 'en',
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select, insert on public.consent_ledger to authenticated;
grant all on public.consent_ledger to service_role;

alter table public.consent_ledger enable row level security;

create policy "users insert own consents"
on public.consent_ledger for insert to authenticated
with check (auth.uid() = user_id);

create policy "users view own consents"
on public.consent_ledger for select to authenticated
using (auth.uid() = user_id);

create policy "admins view all consents"
on public.consent_ledger for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create index idx_consent_ledger_user on public.consent_ledger(user_id, created_at desc);

-- 2. dsar_requests
create table public.dsar_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.dsar_kind not null,
  status public.dsar_status not null default 'pending',
  reason text,
  result_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

grant select, insert on public.dsar_requests to authenticated;
grant all on public.dsar_requests to service_role;

alter table public.dsar_requests enable row level security;

create policy "users insert own dsar"
on public.dsar_requests for insert to authenticated
with check (auth.uid() = user_id);

create policy "users view own dsar"
on public.dsar_requests for select to authenticated
using (auth.uid() = user_id);

create policy "admins view all dsar"
on public.dsar_requests for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "admins update dsar"
on public.dsar_requests for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create trigger trg_dsar_updated_at
before update on public.dsar_requests
for each row execute function public.set_updated_at();

create index idx_dsar_user on public.dsar_requests(user_id, created_at desc);
create index idx_dsar_status on public.dsar_requests(status) where status in ('pending','processing');
