
-- Organizations (no RLS policy yet — profiles.org_id must exist first)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Add org_id columns first
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.grants ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.funders ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_grants_org_id ON public.grants(org_id);
CREATE INDEX IF NOT EXISTS idx_proposals_org_id ON public.proposals(org_id);
CREATE INDEX IF NOT EXISTS idx_submissions_org_id ON public.submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_funders_org_id ON public.funders(org_id);

-- Now safe to create policy referencing profiles.org_id
DROP POLICY IF EXISTS "org_member_r" ON public.organizations;
CREATE POLICY "org_member_r" ON public.organizations FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'IIAL', 'iial')
ON CONFLICT (slug) DO NOTHING;

-- Funders CRA T3010 enrichment
ALTER TABLE public.funders
  ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS charity_status TEXT,
  ADD COLUMN IF NOT EXISTS effective_date TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS accounting_period_end TEXT,
  ADD COLUMN IF NOT EXISTS data_source TEXT,
  ADD COLUMN IF NOT EXISTS data_year INTEGER,
  ADD COLUMN IF NOT EXISTS total_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS total_expenditures NUMERIC,
  ADD COLUMN IF NOT EXISTS program_expenditures NUMERIC,
  ADD COLUMN IF NOT EXISTS admin_expenditures NUMERIC,
  ADD COLUMN IF NOT EXISTS fundraising_expenditures NUMERIC,
  ADD COLUMN IF NOT EXISTS charitable_programs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS directors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS giving_history JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_funders_province ON public.funders(province);
CREATE INDEX IF NOT EXISTS idx_funders_charity_status ON public.funders(charity_status);

ALTER TABLE public.funder_candidates ADD COLUMN IF NOT EXISTS disbursed_annual NUMERIC;

ALTER TABLE public.grant_evaluations
  ADD COLUMN IF NOT EXISTS rule_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.compliance_items
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_items_org_id ON public.compliance_items(org_id);

CREATE OR REPLACE FUNCTION public.can_access_tenant_entity(p_entity_type text, p_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE p_entity_type
    WHEN 'grant' THEN EXISTS (SELECT 1 FROM public.grants r WHERE r.id = p_entity_id AND (r.org_id IS NULL OR r.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
    WHEN 'funder' THEN EXISTS (SELECT 1 FROM public.funders r WHERE r.id = p_entity_id AND (r.org_id IS NULL OR r.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
    WHEN 'proposal' THEN EXISTS (SELECT 1 FROM public.proposals r WHERE r.id = p_entity_id AND (r.user_id = auth.uid() OR (r.org_id IS NOT NULL AND r.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()))))
    WHEN 'submission' THEN EXISTS (SELECT 1 FROM public.submissions r WHERE r.id = p_entity_id AND (r.user_id = auth.uid() OR (r.org_id IS NOT NULL AND r.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()))))
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.can_access_tenant_entity(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_access_tenant_entity(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_funder_catalog(search_query text, result_limit integer DEFAULT 500)
RETURNS TABLE(funder_id uuid, relevance double precision, matched_on text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT f.id,
    CASE
      WHEN lower(f.name) = lower(search_query) THEN 1.0
      WHEN lower(f.name) LIKE lower(search_query) || '%' THEN 0.8
      WHEN lower(f.name) LIKE '%' || lower(search_query) || '%' THEN 0.6
      WHEN lower(coalesce(f.legal_name,'')) LIKE '%' || lower(search_query) || '%' THEN 0.5
      WHEN lower(coalesce(f.city,'')) LIKE '%' || lower(search_query) || '%' THEN 0.3
      ELSE 0.0
    END::double precision AS relevance,
    CASE
      WHEN lower(f.name) LIKE '%' || lower(search_query) || '%' THEN 'name'
      WHEN lower(coalesce(f.legal_name,'')) LIKE '%' || lower(search_query) || '%' THEN 'legal_name'
      WHEN lower(coalesce(f.city,'')) LIKE '%' || lower(search_query) || '%' THEN 'city'
      ELSE 'other'
    END AS matched_on
  FROM public.funders f
  WHERE trim(search_query) = ''
     OR lower(f.name) LIKE '%' || lower(search_query) || '%'
     OR lower(coalesce(f.legal_name,'')) LIKE '%' || lower(search_query) || '%'
     OR lower(coalesce(f.city,'')) LIKE '%' || lower(search_query) || '%'
  ORDER BY relevance DESC
  LIMIT LEAST(GREATEST(result_limit, 1), 500);
$$;
REVOKE ALL ON FUNCTION public.search_funder_catalog(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.search_funder_catalog(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_grant_search_documents(match_threshold double precision DEFAULT 0.35, match_count integer DEFAULT 100)
RETURNS TABLE(grant_id uuid, semantic_similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT g.id, 0.0::double precision FROM public.grants g WHERE false; $$;
GRANT EXECUTE ON FUNCTION public.match_grant_search_documents(double precision, integer) TO authenticated, service_role;
