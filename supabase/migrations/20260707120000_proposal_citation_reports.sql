-- Migration: proposal_citation_reports
--
-- The proposal-quality citation tracker (citation-tracker.functions.ts) stores an
-- AGGREGATE citation report per proposal (the full citations array + a computed
-- summary). The existing `proposal_citations` table is a different, per-row
-- structure (section_id / chunk_id / marker / snippet) owned by the writer flow.
-- A prior migration tried to redefine proposal_citations for the aggregate shape
-- but `CREATE TABLE IF NOT EXISTS` skipped it because the per-row table already
-- existed. This dedicated table resolves that conflict without touching the
-- writer's table.

CREATE TABLE IF NOT EXISTS public.proposal_citation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_citation_reports_proposal
  ON public.proposal_citation_reports (proposal_id);

ALTER TABLE public.proposal_citation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can manage citation reports"
  ON public.proposal_citation_reports;
CREATE POLICY "Authenticated can manage citation reports"
  ON public.proposal_citation_reports
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.proposal_citation_reports TO anon, authenticated, service_role;
