-- Fix audit attribution: the grants_log_transition trigger recorded every
-- status change with actor_user_id NULL, so human-initiated moves (board
-- drag, bulk actions, curation) were indistinguishable from agent moves —
-- and, because grant_events is UPDATE-blocked (20260702120000), that loss
-- was permanent. Capture auth.uid() at insert time instead:
--   * user-scoped clients (server fns using the caller's supabase session)
--     produce events attributed to that user;
--   * service_role / agent pipelines have no auth.uid() -> NULL, which
--     correctly means "automated actor".
-- With attribution handled here, application code no longer needs its own
-- grant_events inserts (the duplicate-row problem fixed app-side).
create or replace function public.log_grant_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.grant_events (grant_id, from_status, to_status, actor_user_id, metadata)
    values (new.id, old.status, new.status, auth.uid(), jsonb_build_object('source', 'trigger'));
  elsif (TG_OP = 'INSERT') then
    insert into public.grant_events (grant_id, from_status, to_status, actor_user_id, metadata)
    values (new.id, null, new.status, auth.uid(), jsonb_build_object('source', 'insert'));
  end if;
  return new;
end;
$$;
revoke execute on function public.log_grant_transition() from public, anon, authenticated;
