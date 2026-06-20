
drop policy if exists "grant_events_read_authenticated" on public.grant_events;
create policy "grant_events_read_own" on public.grant_events
  for select to authenticated
  using (actor_user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "audit_log_insert_self" on public.audit_log;
revoke insert on public.audit_log from authenticated;

drop policy if exists "agent_runs_insert_self" on public.agent_runs;
create policy "agent_runs_insert_self" on public.agent_runs
  for insert to authenticated
  with check (user_id = auth.uid());
