ALTER TABLE public.grants ADD COLUMN IF NOT EXISTS enrich_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.grants ADD COLUMN IF NOT EXISTS enrich_last_error text;
ALTER TABLE public.grants ADD COLUMN IF NOT EXISTS enrich_last_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_grants_enrich_queue ON public.grants(status, enrich_attempts) WHERE status = 'discovered';