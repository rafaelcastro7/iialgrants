-- Strict Multi-Tenant Isolation
-- Closes legacy open policies and ensures complete data isolation between tenants.

-- 1. Close open policy on public.grants (ensure private tenant grants cannot be read by other tenants)
DROP POLICY IF EXISTS "grants_read_authenticated" ON public.grants;
DROP POLICY IF EXISTS "Org members can view org grants" ON public.grants;
CREATE POLICY "Org members can view org grants" ON public.grants
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- 2. Close open policy on public.funders
DROP POLICY IF EXISTS "funders_read_authenticated" ON public.funders;
DROP POLICY IF EXISTS "funders_read_tenant_and_public" ON public.funders;
CREATE POLICY "funders_read_tenant_and_public" ON public.funders
  FOR SELECT TO authenticated
  USING (
    (org_id IS NULL AND (active = true OR public.has_role(auth.uid(), 'admin')))
    OR (
      org_id IS NOT NULL
      AND org_id IN (
        SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  );

-- 3. Close open policy on public.documents (drop permissive docs_auth_all)
DROP POLICY IF EXISTS "docs_auth_all" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
DROP POLICY IF EXISTS "Tenant members can view documents" ON public.documents;
CREATE POLICY "Tenant members can view documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

DROP POLICY IF EXISTS "Tenant members can upload documents" ON public.documents;
CREATE POLICY "Tenant members can upload documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.can_access_tenant_entity(entity_type, entity_id)
  );

DROP POLICY IF EXISTS "Tenant members can update documents" ON public.documents;
CREATE POLICY "Tenant members can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id))
  WITH CHECK (public.can_access_tenant_entity(entity_type, entity_id));

DROP POLICY IF EXISTS "Tenant members can delete documents" ON public.documents;
CREATE POLICY "Tenant members can delete documents" ON public.documents
  FOR DELETE TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

-- 4. Close open policy on public.tasks (drop permissive tasks_auth)
DROP POLICY IF EXISTS "tasks_auth" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tenant members can view tasks" ON public.tasks;
CREATE POLICY "Tenant members can view tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

DROP POLICY IF EXISTS "Tenant members can create tasks" ON public.tasks;
CREATE POLICY "Tenant members can create tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_tenant_entity(entity_type, entity_id)
  );

DROP POLICY IF EXISTS "Tenant members can update tasks" ON public.tasks;
CREATE POLICY "Tenant members can update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id))
  WITH CHECK (public.can_access_tenant_entity(entity_type, entity_id));

DROP POLICY IF EXISTS "Tenant members can delete tasks" ON public.tasks;
CREATE POLICY "Tenant members can delete tasks" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

-- 5. Close open policy on public.comments (drop permissive comments_auth)
DROP POLICY IF EXISTS "comments_auth" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can manage comments" ON public.comments;
DROP POLICY IF EXISTS "Tenant members can view comments" ON public.comments;
CREATE POLICY "Tenant members can view comments" ON public.comments
  FOR SELECT TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

DROP POLICY IF EXISTS "Tenant members can create comments" ON public.comments;
CREATE POLICY "Tenant members can create comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_access_tenant_entity(entity_type, entity_id)
  );

DROP POLICY IF EXISTS "Tenant members can update comments" ON public.comments;
CREATE POLICY "Tenant members can update comments" ON public.comments
  FOR UPDATE TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id))
  WITH CHECK (public.can_access_tenant_entity(entity_type, entity_id));

DROP POLICY IF EXISTS "Tenant members can delete comments" ON public.comments;
CREATE POLICY "Tenant members can delete comments" ON public.comments
  FOR DELETE TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

-- 6. Close open policy on public.compliance_items (drop permissive ci_auth)
DROP POLICY IF EXISTS "ci_auth" ON public.compliance_items;
DROP POLICY IF EXISTS "Authenticated users can manage compliance items" ON public.compliance_items;
DROP POLICY IF EXISTS "Tenant members can view compliance items" ON public.compliance_items;
CREATE POLICY "Tenant members can view compliance items" ON public.compliance_items
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      org_id IS NOT NULL
      AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
    )
    OR (
      submission_id IS NOT NULL
      AND public.can_access_tenant_entity('submission', submission_id)
    )
  );

DROP POLICY IF EXISTS "Tenant members can create compliance items" ON public.compliance_items;
CREATE POLICY "Tenant members can create compliance items" ON public.compliance_items
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (org_id IS NULL AND submission_id IS NULL)
      OR (
        org_id IS NOT NULL
        AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
      )
      OR (
        submission_id IS NOT NULL
        AND public.can_access_tenant_entity('submission', submission_id)
      )
    )
  );

DROP POLICY IF EXISTS "Tenant members can update compliance items" ON public.compliance_items;
CREATE POLICY "Tenant members can update compliance items" ON public.compliance_items
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      org_id IS NOT NULL
      AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
    )
    OR (
      submission_id IS NOT NULL
      AND public.can_access_tenant_entity('submission', submission_id)
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (
      org_id IS NOT NULL
      AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tenant members can delete compliance items" ON public.compliance_items;
CREATE POLICY "Tenant members can delete compliance items" ON public.compliance_items
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      org_id IS NOT NULL
      AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- 7. Close open policy on public.logic_models (drop permissive lm_auth)
DROP POLICY IF EXISTS "lm_auth" ON public.logic_models;
DROP POLICY IF EXISTS "Authenticated users can manage logic models" ON public.logic_models;
DROP POLICY IF EXISTS "Tenant members can view logic models" ON public.logic_models;
CREATE POLICY "Tenant members can view logic models" ON public.logic_models
  FOR SELECT TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id));

DROP POLICY IF EXISTS "Tenant members can create logic models" ON public.logic_models;
CREATE POLICY "Tenant members can create logic models" ON public.logic_models
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_tenant_entity('proposal', proposal_id));

DROP POLICY IF EXISTS "Tenant members can update logic models" ON public.logic_models;
CREATE POLICY "Tenant members can update logic models" ON public.logic_models
  FOR UPDATE TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id))
  WITH CHECK (public.can_access_tenant_entity('proposal', proposal_id));

DROP POLICY IF EXISTS "Tenant members can delete logic models" ON public.logic_models;
CREATE POLICY "Tenant members can delete logic models" ON public.logic_models
  FOR DELETE TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id));

-- 8. Close open policies on approval workflows (drop aw_auth, as_auth, ai_auth)
DROP POLICY IF EXISTS "aw_auth" ON public.approval_workflows;
DROP POLICY IF EXISTS "as_auth" ON public.approval_steps;
DROP POLICY IF EXISTS "ai_auth" ON public.approval_instances;

DROP POLICY IF EXISTS "approval_workflows_admin_all" ON public.approval_workflows;
CREATE POLICY "approval_workflows_admin_all" ON public.approval_workflows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "approval_steps_admin_all" ON public.approval_steps;
CREATE POLICY "approval_steps_admin_all" ON public.approval_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "approval_instances_admin_all" ON public.approval_instances;
CREATE POLICY "approval_instances_admin_all" ON public.approval_instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

