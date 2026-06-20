CREATE TABLE public.evidence_spans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  agent TEXT NOT NULL CHECK (agent IN ('discoverer','enricher','evaluator','strategist','writer','critic')),
  field TEXT NOT NULL,
  value JSONB,
  source_url TEXT NOT NULL,
  source_hash TEXT,
  snippet TEXT NOT NULL,
  snippet_offset INTEGER,
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('regex','chrono','rule','firecrawl_json','llm','manual')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  model TEXT,
  run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.evidence_spans TO authenticated;
GRANT ALL ON public.evidence_spans TO service_role;

ALTER TABLE public.evidence_spans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read evidence spans"
  ON public.evidence_spans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage evidence spans"
  ON public.evidence_spans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_evidence_spans_grant_field ON public.evidence_spans (grant_id, agent, field);
CREATE INDEX idx_evidence_spans_grant ON public.evidence_spans (grant_id, created_at DESC);