-- Closes a real "nothing missed" gap: competitors (Grants.gov saved-search
-- alerts, Submittable's "follow a funder") notify the user the moment a new
-- opportunity matches — this app only ever notified on deadlines. The
-- evaluator now fires a notification the first time a grant crosses the
-- org's own fit threshold, reusing the existing notifications
-- table/NotificationBell UI rather than building a parallel alert system.
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array['deadline', 'decision', 'reminder', 'system', 'strong_fit']));
