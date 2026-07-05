-- Migration: Enrich funders table with CRA T3010 fields
-- Adds columns for Canadian charity data from Open Government Portal

-- Add new columns for CRA T3010 data
ALTER TABLE funders ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS charity_status TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS effective_date TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS accounting_period_end TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS data_year INTEGER;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS total_revenue NUMERIC;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS total_expenditures NUMERIC;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS program_expenditures NUMERIC;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS admin_expenditures NUMERIC;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS fundraising_expenditures NUMERIC;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS charitable_programs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS directors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE funders ADD COLUMN IF NOT EXISTS giving_history JSONB DEFAULT '[]'::jsonb;

-- Index for search
CREATE INDEX IF NOT EXISTS idx_funders_external_id ON funders(external_id);
CREATE INDEX IF NOT EXISTS idx_funders_province ON funders(province);
CREATE INDEX IF NOT EXISTS idx_funders_charity_status ON funders(charity_status);
CREATE INDEX IF NOT EXISTS idx_funders_name_trgm ON funders USING gin(name gin_trgm_ops);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_funders_search ON funders USING gin(
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(legal_name, '') || ' ' || coalesce(city, ''))
);
