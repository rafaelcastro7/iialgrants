
-- ============ APPROVAL WORKFLOWS / STEPS / INSTANCES: admin only ============
DROP POLICY IF EXISTS aw_auth ON public.approval_workflows;
DROP POLICY IF EXISTS as_auth ON public.approval_steps;
DROP POLICY IF EXISTS ai_auth ON public.approval_instances;

CREATE POLICY approval_workflows_admin_all ON public.approval_workflows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY approval_steps_admin_all ON public.approval_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY approval_instances_admin_all ON public.approval_instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Signed-in users can see approval instances for entities they can access
CREATE POLICY approval_instances_owner_read ON public.approval_instances
  FOR SELECT TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id));

-- ============ AUDIT TRAIL: admin read, self-insert only ============
DROP POLICY IF EXISTS at_auth_s ON public.audit_trail;
DROP POLICY IF EXISTS at_auth_i ON public.audit_trail;

CREATE POLICY audit_trail_admin_read ON public.audit_trail
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY audit_trail_self_insert ON public.audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- ============ TASKS / COMMENTS / DOCUMENTS: entity-scoped ============
DROP POLICY IF EXISTS tasks_auth ON public.tasks;
DROP POLICY IF EXISTS comments_auth ON public.comments;
DROP POLICY IF EXISTS docs_auth_all ON public.documents;

CREATE POLICY tasks_entity_all ON public.tasks
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id))
  WITH CHECK (public.can_access_tenant_entity(entity_type, entity_id));
CREATE POLICY comments_entity_all ON public.comments
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id))
  WITH CHECK (public.can_access_tenant_entity(entity_type, entity_id));
CREATE POLICY documents_entity_all ON public.documents
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity(entity_type, entity_id))
  WITH CHECK (public.can_access_tenant_entity(entity_type, entity_id));

-- ============ COMPLIANCE / LOGIC / REVIEWS: proposal/submission-scoped ============
DROP POLICY IF EXISTS ci_auth ON public.compliance_items;
DROP POLICY IF EXISTS lm_auth ON public.logic_models;
DROP POLICY IF EXISTS pr_auth ON public.proposal_reviews;
DROP POLICY IF EXISTS cm_auth ON public.compliance_matrices;
DROP POLICY IF EXISTS pcr_auth ON public.proposal_citation_reports;

CREATE POLICY compliance_items_scoped ON public.compliance_items
  FOR ALL TO authenticated
  USING (
    (submission_id IS NOT NULL AND public.can_access_tenant_entity('submission', submission_id))
    OR (submission_id IS NULL AND created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (submission_id IS NOT NULL AND public.can_access_tenant_entity('submission', submission_id))
    OR (submission_id IS NULL AND created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY logic_models_scoped ON public.logic_models
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id))
  WITH CHECK (public.can_access_tenant_entity('proposal', proposal_id));

CREATE POLICY proposal_reviews_scoped ON public.proposal_reviews
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id))
  WITH CHECK (public.can_access_tenant_entity('proposal', proposal_id));

CREATE POLICY compliance_matrices_scoped ON public.compliance_matrices
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id))
  WITH CHECK (public.can_access_tenant_entity('proposal', proposal_id));

CREATE POLICY proposal_citation_reports_scoped ON public.proposal_citation_reports
  FOR ALL TO authenticated
  USING (public.can_access_tenant_entity('proposal', proposal_id))
  WITH CHECK (public.can_access_tenant_entity('proposal', proposal_id));

-- ============ AGENT CONFIG AUDIT / CONFIGS / FLAGS: admin-only reads ============
DROP POLICY IF EXISTS agent_config_audit_select_auth ON public.agent_config_audit;
CREATE POLICY agent_config_audit_admin_read ON public.agent_config_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS agent_configs_select_all_auth ON public.agent_configs;
CREATE POLICY agent_configs_admin_read ON public.agent_configs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "agent_flags: authenticated can read" ON public.agent_flags;
CREATE POLICY agent_flags_admin_read ON public.agent_flags
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "module_flags: authenticated can read" ON public.module_flags;
CREATE POLICY module_flags_admin_read ON public.module_flags
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ AGENT TRACE STEPS / EVIDENCE SPANS: grant-scoped ============
DROP POLICY IF EXISTS authenticated_read_traces ON public.agent_trace_steps;
CREATE POLICY agent_trace_steps_grant_scoped_read ON public.agent_trace_steps
  FOR SELECT TO authenticated
  USING (
    grant_id IS NULL AND public.has_role(auth.uid(), 'admin')
    OR (grant_id IS NOT NULL AND public.can_access_tenant_entity('grant', grant_id))
  );

DROP POLICY IF EXISTS "Authenticated users can read evidence spans" ON public.evidence_spans;
CREATE POLICY evidence_spans_grant_scoped_read ON public.evidence_spans
  FOR SELECT TO authenticated
  USING (
    grant_id IS NULL AND public.has_role(auth.uid(), 'admin')
    OR (grant_id IS NOT NULL AND public.can_access_tenant_entity('grant', grant_id))
  );

-- ============ FUNCTION HARDENING: revoke public/anon execute; set search_path ============
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_grant_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_promote_stale_candidates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_grant_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_audit_mutation() FROM PUBLIC, anon, authenticated;

-- has_role, is_admin, can_access_tenant_entity: used inside RLS policies, keep authenticated but revoke anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_tenant_entity(text, uuid) FROM PUBLIC, anon;

-- RPCs invoked by signed-in users: revoke anon
REVOKE EXECUTE ON FUNCTION public.record_grant_search_feedback(uuid, uuid, text, text, text, text, integer, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bump_proposal_version(uuid) FROM PUBLIC, anon;

-- Fix mutable search_path on trigger fn
CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN RAISE EXCEPTION 'audit_events_are_append_only'; END;
$function$;
