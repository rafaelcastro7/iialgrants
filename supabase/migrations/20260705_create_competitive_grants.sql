-- Migration: Create competitive_grants table
-- Stores Canadian government grant recipients from TBS Proactive Disclosure

CREATE TABLE IF NOT EXISTS competitive_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT UNIQUE NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_legal_name TEXT,
  recipient_type TEXT,
  recipient_province TEXT,
  recipient_city TEXT,
  program_name TEXT,
  agreement_title TEXT,
  agreement_value NUMERIC,
  agreement_start_date TEXT,
  agreement_end_date TEXT,
  agreement_type TEXT,
  description TEXT,
  naics_code TEXT,
  department TEXT,
  data_source TEXT NOT NULL DEFAULT 'tbs_proactive_disclosure',
  data_year INTEGER NOT NULL DEFAULT 2025,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for search and filtering
CREATE INDEX IF NOT EXISTS idx_competitive_grants_recipient ON competitive_grants(recipient_name);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_program ON competitive_grants(program_name);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_province ON competitive_grants(recipient_province);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_value ON competitive_grants(agreement_value DESC);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_date ON competitive_grants(agreement_start_date DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_competitive_grants_search ON competitive_grants USING gin(
  to_tsvector('english', coalesce(recipient_name, '') || ' ' || coalesce(program_name, '') || ' ' || coalesce(agreement_title, ''))
);

-- RLS policies
ALTER TABLE competitive_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read competitive grants"
  ON competitive_grants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert competitive grants"
  ON competitive_grants
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update competitive grants"
  ON competitive_grants
  FOR UPDATE
  TO service_role
  USING (true);
