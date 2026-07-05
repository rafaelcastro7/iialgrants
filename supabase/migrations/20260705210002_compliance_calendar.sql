-- Compliance Calendar — deadline tracking + automated reminders

CREATE TABLE IF NOT EXISTS public.compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions(id),
  type TEXT NOT NULL CHECK (type IN ('progress_report', 'financial_report', 'final_report', 'audit', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'once' CHECK (frequency IN ('once', 'quarterly', 'semi_annual', 'annual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_items_due ON public.compliance_items(due_date, status);
CREATE INDEX IF NOT EXISTS idx_compliance_items_submission ON public.compliance_items(submission_id);

ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage compliance items"
  ON public.compliance_items FOR ALL
  USING (auth.role() = 'authenticated');
