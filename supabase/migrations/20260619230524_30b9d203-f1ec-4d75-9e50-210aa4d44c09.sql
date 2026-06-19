-- Phase 0 (Sprint 0): roles, profiles, audit_log
-- ADR-006 (data residency CA) and bilingual EN/FR scaffolding (ADR-008).

create type public.app_role as enum ('admin', 'member', 'viewer');
create type public.app_lang as enum ('en', 'fr');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_name text,
  country text not null default 'CA',
  preferred_lang public.app_lang not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_self_select" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_self_insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- user_roles (separate table, never on profile -> prevents privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- security-definer role check (avoids recursive RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "user_roles_self_select" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "user_roles_admin_all" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- audit_log (PIPEDA / Quebec Law 25 — immutable append-only)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit_log_self_select" on public.audit_log for select to authenticated using (user_id = auth.uid());
create policy "audit_log_admin_select" on public.audit_log for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "audit_log_insert_self" on public.audit_log for insert to authenticated with check (user_id = auth.uid());

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- auto-provision profile + default 'member' role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, preferred_lang)
  values (new.id, coalesce((new.raw_user_meta_data->>'preferred_lang')::public.app_lang, 'en'))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'member')
  on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();