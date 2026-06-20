
-- 1. Extend funders with BN + disbursed_annual (from CRA T3010)
ALTER TABLE public.funders
  ADD COLUMN IF NOT EXISTS bn_number text,
  ADD COLUMN IF NOT EXISTS disbursed_annual numeric;
CREATE UNIQUE INDEX IF NOT EXISTS funders_bn_number_uniq
  ON public.funders(bn_number) WHERE bn_number IS NOT NULL;

-- 2. funder_candidates table
CREATE TABLE IF NOT EXISTS public.funder_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_fr text,
  bn_number text,
  province text,
  funder_type text,
  website text,
  source_signals text[] NOT NULL DEFAULT '{}',
  score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_review',
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funder_candidates_status_chk
    CHECK (status IN ('candidate','pending_review','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS funder_candidates_status_idx
  ON public.funder_candidates(status, score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS funder_candidates_bn_uniq
  ON public.funder_candidates(bn_number) WHERE bn_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS funder_candidates_name_lower_idx
  ON public.funder_candidates(lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funder_candidates TO authenticated;
GRANT ALL ON public.funder_candidates TO service_role;
ALTER TABLE public.funder_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funder_candidates_admin_all" ON public.funder_candidates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER funder_candidates_set_updated_at
  BEFORE UPDATE ON public.funder_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. source_ingest_runs log
CREATE TABLE IF NOT EXISTS public.source_ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL,
  rows_in integer NOT NULL DEFAULT 0,
  candidates_out integer NOT NULL DEFAULT 0,
  auto_approved integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  latency_ms integer,
  status text NOT NULL DEFAULT 'succeeded',
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS source_ingest_runs_run_at_idx
  ON public.source_ingest_runs(run_at DESC);

GRANT SELECT, INSERT ON public.source_ingest_runs TO authenticated;
GRANT ALL ON public.source_ingest_runs TO service_role;
ALTER TABLE public.source_ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source_ingest_runs_admin_read" ON public.source_ingest_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "source_ingest_runs_service_write" ON public.source_ingest_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
