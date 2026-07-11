-- approval_workflows/steps/instances RLS allowed ANY authenticated user to
-- create/submit/approve compliance workflows directly, bypassing the
-- server-fn's assertAdmin gate entirely. This whole feature is admin-only
-- (only consumed by src/routes/_authenticated.admin.workflows.tsx) — restrict
-- accordingly, matching the has_role() pattern used elsewhere.

DROP POLICY IF EXISTS "Authenticated users can manage workflows" ON public.approval_workflows;
DROP POLICY IF EXISTS "Authenticated users can manage steps" ON public.approval_steps;
DROP POLICY IF EXISTS "Authenticated users can manage instances" ON public.approval_instances;

CREATE POLICY "approval_workflows_admin_all"
  ON public.approval_workflows FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "approval_steps_admin_all"
  ON public.approval_steps FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "approval_instances_admin_all"
  ON public.approval_instances FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
