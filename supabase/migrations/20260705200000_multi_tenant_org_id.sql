-- Multi-tenant: Add org_id to profiles + organizations table
-- Phase 5.7 of the 44-feature upgrade

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add org_id to profiles (nullable for backward compatibility)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- 3. Create index for org_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);

-- 4. Add org_id to core tables (nullable, populated over time)
ALTER TABLE public.grants
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.funders
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- 5. Create indexes for org_id on core tables
CREATE INDEX IF NOT EXISTS idx_grants_org_id ON public.grants(org_id);
CREATE INDEX IF NOT EXISTS idx_proposals_org_id ON public.proposals(org_id);
CREATE INDEX IF NOT EXISTS idx_submissions_org_id ON public.submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_funders_org_id ON public.funders(org_id);

-- 6. Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies: users can only see their own org
CREATE POLICY "Users can view their own organization"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 8. Org members can view org data (grants, proposals, submissions)
CREATE POLICY "Org members can view org grants"
  ON public.grants FOR SELECT
  USING (
    org_id IS NULL  -- Legacy data without org_id is visible to all
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can view org proposals"
  ON public.proposals FOR SELECT
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can view org submissions"
  ON public.submissions FOR SELECT
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 9. Create default IIAL organization
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'IIAL', 'iial')
ON CONFLICT (slug) DO NOTHING;
