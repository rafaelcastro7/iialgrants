CREATE TABLE public.fit_rules (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  min_amount_cad numeric,
  max_amount_cad numeric,
  required_jurisdictions text[] NOT NULL DEFAULT '{}',
  excluded_jurisdictions text[] NOT NULL DEFAULT '{}',
  required_sectors text[] NOT NULL DEFAULT '{}',
  excluded_sectors text[] NOT NULL DEFAULT '{}',
  required_keywords text[] NOT NULL DEFAULT '{}',
  excluded_keywords text[] NOT NULL DEFAULT '{}',
  min_days_to_deadline integer,
  weight_llm numeric NOT NULL DEFAULT 0.5 CHECK (weight_llm >= 0 AND weight_llm <= 1),
  threshold_fit_pass integer NOT NULL DEFAULT 60 CHECK (threshold_fit_pass BETWEEN 0 AND 100),
  hard_fail_on_jurisdiction boolean NOT NULL DEFAULT true,
  hard_fail_on_excluded_keyword boolean NOT NULL DEFAULT true,
  hard_fail_on_amount boolean NOT NULL DEFAULT false,
  hard_fail_on_deadline boolean NOT NULL DEFAULT false,
  auto_archive_on_fail boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fit_rules TO authenticated;
GRANT ALL ON public.fit_rules TO service_role;

ALTER TABLE public.fit_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage their own fit rules"
  ON public.fit_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER fit_rules_updated_at
  BEFORE UPDATE ON public.fit_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();