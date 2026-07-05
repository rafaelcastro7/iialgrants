-- Approval Workflows — multi-step grant/proposal approvals

CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant', 'proposal')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at TIMESTAMPTZ,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approval_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant', 'proposal')),
  entity_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_workflow ON public.approval_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_approval_instances_entity ON public.approval_instances(entity_type, entity_id);

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage workflows"
  ON public.approval_workflows FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage steps"
  ON public.approval_steps FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage instances"
  ON public.approval_instances FOR ALL
  USING (auth.role() = 'authenticated');
