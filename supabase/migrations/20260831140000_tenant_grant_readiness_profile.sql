-- Make the organization profile a tenant asset instead of a private user blob.
-- IIAL's production users previously had no org assignment/profile while the
-- only populated profile belonged to the Playwright tenant. That made search,
-- evaluation and drafting depend on whichever user happened to click the UI.

ALTER TABLE public.org_profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS business_number text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS applicant_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS activities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS populations_served text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS operating_regions text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{en}'::text[],
  ADD COLUMN IF NOT EXISTS years_operating integer,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS funding_min_cad numeric(14,2),
  ADD COLUMN IF NOT EXISTS funding_max_cad numeric(14,2),
  ADD COLUMN IF NOT EXISTS cost_share_max_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS indirect_cost_rate_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS profile_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.org_profiles
  DROP CONSTRAINT IF EXISTS org_profiles_years_operating_check,
  ADD CONSTRAINT org_profiles_years_operating_check
    CHECK (years_operating IS NULL OR years_operating BETWEEN 0 AND 500),
  DROP CONSTRAINT IF EXISTS org_profiles_employee_count_check,
  ADD CONSTRAINT org_profiles_employee_count_check
    CHECK (employee_count IS NULL OR employee_count BETWEEN 0 AND 10000000),
  DROP CONSTRAINT IF EXISTS org_profiles_funding_range_check,
  ADD CONSTRAINT org_profiles_funding_range_check
    CHECK (
      (funding_min_cad IS NULL OR funding_min_cad >= 0)
      AND (funding_max_cad IS NULL OR funding_max_cad >= 0)
      AND (funding_min_cad IS NULL OR funding_max_cad IS NULL OR funding_min_cad <= funding_max_cad)
    ),
  DROP CONSTRAINT IF EXISTS org_profiles_cost_share_check,
  ADD CONSTRAINT org_profiles_cost_share_check
    CHECK (cost_share_max_pct IS NULL OR cost_share_max_pct BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS org_profiles_indirect_cost_check,
  ADD CONSTRAINT org_profiles_indirect_cost_check
    CHECK (indirect_cost_rate_pct IS NULL OR indirect_cost_rate_pct BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS org_profiles_registration_status_check,
  ADD CONSTRAINT org_profiles_registration_status_check
    CHECK (registration_status IS NULL OR registration_status IN (
      'registered_charity', 'nonprofit', 'for_profit', 'public_body',
      'academic', 'indigenous', 'unregistered', 'other'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS org_profiles_org_id_uq
  ON public.org_profiles(org_id);
CREATE INDEX IF NOT EXISTS org_profiles_applicant_types_gin
  ON public.org_profiles USING gin(applicant_types);

-- Preserve existing profiles by connecting them to the tenant already carried
-- by their owning user.
UPDATE public.org_profiles op
SET org_id = p.org_id
FROM public.profiles p
WHERE p.id = op.user_id
  AND op.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- This deployment is IIAL's dedicated instance. Historical production users
-- created before multi-tenancy had NULL org_id and therefore could not share
-- tasks, documents, proposals or profile criteria at all.
UPDATE public.profiles
SET org_id = '00000000-0000-0000-0000-000000000001',
    org_name = COALESCE(org_name, 'IIAL')
WHERE org_id IS NULL;

-- Create an honest, intentionally incomplete IIAL profile. The UI names the
-- missing facts instead of inventing sectors, budgets or eligibility claims.
INSERT INTO public.org_profiles (
  user_id, org_id, org_name, stage, jurisdictions, languages, registration_status
)
SELECT p.id,
       '00000000-0000-0000-0000-000000000001',
       'IIAL',
       'nonprofit'::public.org_stage,
       ARRAY['CA']::text[],
       ARRAY['en', 'fr']::text[],
       'nonprofit'
FROM public.profiles p
WHERE p.org_id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.org_profiles op
    WHERE op.org_id = '00000000-0000-0000-0000-000000000001'
  )
ORDER BY p.created_at
LIMIT 1;

DROP POLICY IF EXISTS org_profiles_org_select ON public.org_profiles;
CREATE POLICY org_profiles_org_select ON public.org_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND org_id = (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS org_profiles_org_update ON public.org_profiles;
CREATE POLICY org_profiles_org_update ON public.org_profiles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND org_id = (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    ))
  )
  WITH CHECK (
    org_id IS NULL OR org_id = (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

COMMENT ON COLUMN public.org_profiles.profile_evidence IS
  'Source receipts for organization-profile claims; facts without evidence remain user-asserted.';
