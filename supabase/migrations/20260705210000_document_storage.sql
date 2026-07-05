-- Document Storage — file attachments for grants, proposals, submissions, funders

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant', 'proposal', 'submission', 'funder')),
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_entity ON public.documents(entity_type, entity_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view documents"
  ON public.documents FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete documents"
  ON public.documents FOR DELETE
  USING (auth.role() = 'authenticated');
