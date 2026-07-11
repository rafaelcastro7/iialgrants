-- audit_trail RLS allowed ANY authenticated user to read/insert directly via
-- the Supabase client, bypassing the server-fn's assertAdmin gate entirely.
-- Restrict to admin-only, matching audit_log's existing admin-select pattern.

DROP POLICY IF EXISTS "Authenticated users can view audit trail" ON public.audit_trail;
DROP POLICY IF EXISTS "Authenticated users can insert audit events" ON public.audit_trail;

CREATE POLICY "audit_trail_admin_select"
  ON public.audit_trail FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "audit_trail_admin_insert"
  ON public.audit_trail FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
