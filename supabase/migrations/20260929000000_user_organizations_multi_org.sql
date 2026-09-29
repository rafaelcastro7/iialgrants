-- Multi-org support: user_organizations many-to-many table
-- Allows users to belong to/access multiple organizations

-- 1. Create user_organizations junction table
CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- 2. Enable RLS
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies for user_organizations
-- Users can view their own organization memberships
CREATE POLICY "Users can view their own org memberships"
  ON public.user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- Users can view other members of organizations they belong to
CREATE POLICY "Users can view org members of their orgs"
  ON public.user_organizations FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

-- Only owners/admins can insert new memberships
CREATE POLICY "Org owners and admins can add members"
  ON public.user_organizations FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only owners/admins can update memberships
CREATE POLICY "Org owners and admins can update members"
  ON public.user_organizations FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only owners can delete memberships (and not their own)
CREATE POLICY "Org owners can remove members"
  ON public.user_organizations FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'owner'
    )
    AND user_id != auth.uid()
  );

-- 4. Update organizations RLS to use user_organizations
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;

CREATE POLICY "Users can view organizations they belong to"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

-- 5. Update core tables RLS to use user_organizations
DROP POLICY IF EXISTS "Org members can view org grants" ON public.grants;
DROP POLICY IF EXISTS "Org members can view org proposals" ON public.proposals;
DROP POLICY IF EXISTS "Org members can view org submissions" ON public.submissions;

CREATE POLICY "Org members can view org grants"
  ON public.grants FOR SELECT
  USING (
    org_id IS NULL  -- Legacy data without org_id is visible to all
    OR org_id IN (
      SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view org proposals"
  ON public.proposals FOR SELECT
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view org submissions"
  ON public.submissions FOR SELECT
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

-- 6. Add org_id to funders if not exists, update RLS
DROP POLICY IF EXISTS "Org members can view org funders" ON public.funders;

CREATE POLICY "Org members can view org funders"
  ON public.funders FOR SELECT
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
    )
  );

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id ON public.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_org_id ON public.user_organizations(org_id);

-- 8. Migrate existing profiles.org_id to user_organizations
-- This backfills the junction table for existing users
INSERT INTO public.user_organizations (user_id, org_id, role)
SELECT id, org_id, 'owner'
FROM public.profiles
WHERE org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- 9. Ensure IIAL org exists and link any users without org to it
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'IIAL', 'iial')
ON CONFLICT (slug) DO NOTHING;

-- Link users with no org to IIAL
INSERT INTO public.user_organizations (user_id, org_id, role)
SELECT p.id, '00000000-0000-0000-0000-000000000001', 'member'
FROM public.profiles p
LEFT JOIN public.user_organizations uo ON uo.user_id = p.id
WHERE uo.user_id IS NULL
ON CONFLICT (user_id, org_id) DO NOTHING;