-- Preserve search-learning evidence even when a privileged client is used.
drop trigger if exists grant_search_feedback_events_no_update
  on public.grant_search_feedback_events;

create trigger grant_search_feedback_events_no_mutation
  before update or delete on public.grant_search_feedback_events
  for each row execute function public.reject_audit_mutation();
