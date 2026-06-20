-- Issue #6: grants are a shared catalog (grants_read_authenticated USING true),
-- so agent-generated events (actor_user_id IS NULL) should also be visible to
-- any authenticated user. Human-actor events remain restricted to their author
-- or admins.
DROP POLICY IF EXISTS grant_events_read_own ON public.grant_events;

CREATE POLICY grant_events_read_own
ON public.grant_events
FOR SELECT
TO authenticated
USING (
  actor_user_id IS NULL
  OR actor_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
);