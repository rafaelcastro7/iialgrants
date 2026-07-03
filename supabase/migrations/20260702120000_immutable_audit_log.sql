-- ============================================================================
-- C6: Real immutability for the audit trail
-- ============================================================================
-- Problem (audit finding): audit tables were only protected by RLS policies.
-- RLS is BYPASSED by service_role (and by table owners / BYPASSRLS roles),
-- so anyone holding the service key could UPDATE/DELETE audit rows and
-- rewrite compliance history (PIPEDA / Quebec Law 25 require append-only).
--
-- Fix: BEFORE UPDATE/DELETE triggers. Unlike RLS, ordinary (non-INTERNAL)
-- Postgres triggers fire for EVERY role — including service_role, postgres,
-- and BYPASSRLS roles — because trigger execution is part of statement
-- execution itself, not of the row-visibility layer. The only ways around
-- them are ALTER TABLE ... DISABLE TRIGGER or DROP, which require table
-- ownership and leave a visible DDL footprint.
--
-- Protected tables and rationale (based on code audit of src/ on 2026-07-02):
--
--   public.audit_log          -> UPDATE + DELETE blocked (fully immutable).
--                                App only INSERTs (compliance.functions.ts,
--                                admin-*.functions.ts) and SELECTs.
--   public.agent_config_audit -> UPDATE + DELETE blocked (fully immutable).
--                                App only INSERTs via config-change flow.
--   public.grant_events       -> UPDATE blocked only. No .update() exists in
--                                src/, but resetAllGrants (admin-grants.
--                                functions.ts) legitimately DELETEs all rows
--                                as part of the admin "wipe all grants"
--                                reset, so DELETE stays allowed.
--   public.agent_runs         -> UPDATE blocked only. Rows are insert-only in
--                                all agent code, but resetAllGrants DELETEs
--                                rows with grant_id, so DELETE stays allowed.
--   public.agent_trace_steps  -> UPDATE blocked only, same reason as above.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- ============================================================================

-- Trigger function: unconditionally rejects the mutation.
create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Table public.% is append-only: % is not allowed (compliance audit trail, C6)',
    tg_table_name, tg_op
    using errcode = 'raise_exception',
          hint = 'Audit rows are immutable for all roles, including service_role.';
  return null; -- unreachable
end;
$$;

comment on function public.reject_audit_mutation() is
  'C6: raises on any UPDATE/DELETE against append-only audit tables. Fires for all roles (triggers are not subject to RLS bypass).';

-- ---------------------------------------------------------------------------
-- Fully immutable tables: block UPDATE and DELETE
-- ---------------------------------------------------------------------------

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.reject_audit_mutation();

drop trigger if exists agent_config_audit_immutable on public.agent_config_audit;
create trigger agent_config_audit_immutable
  before update or delete on public.agent_config_audit
  for each row execute function public.reject_audit_mutation();

-- ---------------------------------------------------------------------------
-- Append-only-with-admin-reset tables: block UPDATE only.
-- DELETE remains allowed because the admin resetAllGrants server function
-- (src/lib/admin-grants.functions.ts) performs a legitimate bulk wipe of
-- grant_events / agent_runs / agent_trace_steps via service_role.
-- ---------------------------------------------------------------------------

drop trigger if exists grant_events_no_update on public.grant_events;
create trigger grant_events_no_update
  before update on public.grant_events
  for each row execute function public.reject_audit_mutation();

drop trigger if exists agent_runs_no_update on public.agent_runs;
create trigger agent_runs_no_update
  before update on public.agent_runs
  for each row execute function public.reject_audit_mutation();

drop trigger if exists agent_trace_steps_no_update on public.agent_trace_steps;
create trigger agent_trace_steps_no_update
  before update on public.agent_trace_steps
  for each row execute function public.reject_audit_mutation();
