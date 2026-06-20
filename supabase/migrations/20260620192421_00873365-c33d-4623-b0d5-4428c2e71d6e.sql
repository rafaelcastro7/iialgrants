ALTER TABLE public.fit_rules
  ADD COLUMN IF NOT EXISTS applicant_types_allowed text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicant_types_excluded text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lead_min_weeks integer,
  ADD COLUMN IF NOT EXISTS partner_min_weeks integer,
  ADD COLUMN IF NOT EXISTS iial_capabilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_cost_share_pct_org_carries numeric,
  ADD COLUMN IF NOT EXISTS require_match_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rolling_intake_passes_runway boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hard_fail_on_applicant_type boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hard_fail_on_runway boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hard_fail_on_capability boolean NOT NULL DEFAULT false;