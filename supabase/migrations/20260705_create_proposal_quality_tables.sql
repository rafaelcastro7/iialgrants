-- Migration: Create proposal quality tables
-- Multi-expert review, compliance matrix, citation tracking

-- Proposal reviews (multi-expert panel)
CREATE TABLE IF NOT EXISTS proposal_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  overall_score NUMERIC(3,1) NOT NULL,
  reviewer_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id)
);

-- Compliance matrices
CREATE TABLE IF NOT EXISTS compliance_matrices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL,
  mandatory_met INTEGER NOT NULL,
  mandatory_total INTEGER NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_alignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id)
);

-- Aggregate citation reports moved to public.proposal_citation_reports in
-- 20260707120000_proposal_citation_reports.sql. The existing
-- public.proposal_citations table is a per-section citation table and must not
-- be redefined here.

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposal_reviews_proposal ON proposal_reviews(proposal_id);
CREATE INDEX IF NOT EXISTS idx_compliance_matrices_proposal ON compliance_matrices(proposal_id);

-- RLS policies
ALTER TABLE proposal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_matrices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read proposal reviews"
  ON proposal_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read compliance matrices"
  ON compliance_matrices FOR SELECT TO authenticated USING (true);
