-- Audit Trail — comprehensive change logging

CREATE TABLE IF NOT EXISTS public.audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'status_change', 'approval', 'submission')),
  changes JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON public.audit_trail(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON public.audit_trail(action, created_at DESC);

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit trail"
  ON public.audit_trail FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert audit events"
  ON public.audit_trail FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
