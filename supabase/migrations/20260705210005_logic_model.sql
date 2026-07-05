-- Logic Model — theory of change binding

CREATE TABLE IF NOT EXISTS public.logic_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  inputs JSONB NOT NULL DEFAULT '[]',
  activities JSONB NOT NULL DEFAULT '[]',
  outputs JSONB NOT NULL DEFAULT '[]',
  outcomes JSONB NOT NULL DEFAULT '[]',
  impact JSONB NOT NULL DEFAULT '[]',
  assumptions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id)
);

ALTER TABLE public.logic_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage logic models"
  ON public.logic_models FOR ALL
  USING (auth.role() = 'authenticated');
