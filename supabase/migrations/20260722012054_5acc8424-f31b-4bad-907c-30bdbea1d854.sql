
-- Helper functions
CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events_are_append_only'; END;
$$;

-- Missing columns on grant_evaluations
ALTER TABLE public.grant_evaluations
  ADD COLUMN IF NOT EXISTS llm_fit_score numeric,
  ADD COLUMN IF NOT EXISTS axis_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Documents
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant','proposal','submission','funder')),
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON public.documents(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "docs_auth_all" ON public.documents;
CREATE POLICY "docs_auth_all" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Approval workflows
CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant','proposal')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_at TIMESTAMPTZ,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.approval_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grant','proposal')),
  entity_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_approval_steps_workflow ON public.approval_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_approval_instances_entity ON public.approval_instances(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_workflows, public.approval_steps, public.approval_instances TO authenticated;
GRANT ALL ON public.approval_workflows, public.approval_steps, public.approval_instances TO service_role;
ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aw_auth" ON public.approval_workflows;
CREATE POLICY "aw_auth" ON public.approval_workflows FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "as_auth" ON public.approval_steps;
CREATE POLICY "as_auth" ON public.approval_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_auth" ON public.approval_instances;
CREATE POLICY "ai_auth" ON public.approval_instances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Compliance
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions(id),
  type TEXT NOT NULL CHECK (type IN ('progress_report','financial_report','final_report','audit','other')),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','quarterly','semi_annual','annual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','overdue')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_items_due ON public.compliance_items(due_date, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_items TO authenticated;
GRANT ALL ON public.compliance_items TO service_role;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ci_auth" ON public.compliance_items;
CREATE POLICY "ci_auth" ON public.compliance_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit trail
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON public.audit_trail(entity_type, entity_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_trail TO authenticated;
GRANT ALL ON public.audit_trail TO service_role;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "at_auth_s" ON public.audit_trail;
CREATE POLICY "at_auth_s" ON public.audit_trail FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "at_auth_i" ON public.audit_trail;
CREATE POLICY "at_auth_i" ON public.audit_trail FOR INSERT TO authenticated WITH CHECK (true);

-- Tasks + comments
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.comments TO authenticated;
GRANT ALL ON public.tasks, public.comments TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_auth" ON public.tasks;
CREATE POLICY "tasks_auth" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "comments_auth" ON public.comments;
CREATE POLICY "comments_auth" ON public.comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Logic models
CREATE TABLE IF NOT EXISTS public.logic_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  inputs JSONB NOT NULL DEFAULT '[]',
  activities JSONB NOT NULL DEFAULT '[]',
  outputs JSONB NOT NULL DEFAULT '[]',
  outcomes JSONB NOT NULL DEFAULT '[]',
  impact JSONB NOT NULL DEFAULT '[]',
  assumptions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logic_models TO authenticated;
GRANT ALL ON public.logic_models TO service_role;
ALTER TABLE public.logic_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lm_auth" ON public.logic_models;
CREATE POLICY "lm_auth" ON public.logic_models FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Competitive grants
CREATE TABLE IF NOT EXISTS public.competitive_grants (
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
CREATE INDEX IF NOT EXISTS idx_competitive_grants_recipient ON public.competitive_grants(recipient_name);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_program ON public.competitive_grants(program_name);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_province ON public.competitive_grants(recipient_province);
CREATE INDEX IF NOT EXISTS idx_competitive_grants_value ON public.competitive_grants(agreement_value DESC);
GRANT SELECT ON public.competitive_grants TO authenticated;
GRANT ALL ON public.competitive_grants TO service_role;
ALTER TABLE public.competitive_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cg_auth_r" ON public.competitive_grants;
CREATE POLICY "cg_auth_r" ON public.competitive_grants FOR SELECT TO authenticated USING (true);

-- Proposal reviews + compliance matrices
CREATE TABLE IF NOT EXISTS public.proposal_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  overall_score NUMERIC(3,1) NOT NULL,
  reviewer_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id)
);
CREATE TABLE IF NOT EXISTS public.compliance_matrices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL,
  mandatory_met INTEGER NOT NULL,
  mandatory_total INTEGER NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_alignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_reviews, public.compliance_matrices TO authenticated;
GRANT ALL ON public.proposal_reviews, public.compliance_matrices TO service_role;
ALTER TABLE public.proposal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_matrices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_auth" ON public.proposal_reviews;
CREATE POLICY "pr_auth" ON public.proposal_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cm_auth" ON public.compliance_matrices;
CREATE POLICY "cm_auth" ON public.compliance_matrices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Proposal citation reports
CREATE TABLE IF NOT EXISTS public.proposal_citation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id)
);
GRANT ALL ON public.proposal_citation_reports TO authenticated, service_role;
ALTER TABLE public.proposal_citation_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcr_auth" ON public.proposal_citation_reports;
CREATE POLICY "pcr_auth" ON public.proposal_citation_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Shared fit reports
CREATE TABLE IF NOT EXISTS public.shared_fit_reports (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked boolean not null default false
);
GRANT SELECT, INSERT, UPDATE ON public.shared_fit_reports TO authenticated;
GRANT ALL ON public.shared_fit_reports TO service_role;
ALTER TABLE public.shared_fit_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sfr_owner" ON public.shared_fit_reports;
CREATE POLICY "sfr_owner" ON public.shared_fit_reports FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Grant search profiles (skip org FK since organizations table doesn't exist)
CREATE TABLE IF NOT EXISTS public.grant_search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid,
  name text not null,
  mission text not null default '',
  activities text[] not null default '{}',
  populations_served text[] not null default '{}',
  funding_uses text[] not null default '{}',
  sectors text[] not null default '{}',
  jurisdictions text[] not null default '{CA}',
  applicant_types text[] not null default '{}',
  amount_min_cad numeric(14,2),
  amount_max_cad numeric(14,2),
  project_start date,
  project_end date,
  role text not null default 'either' check (role in ('lead','partner','either')),
  required_terms text[] not null default '{}',
  excluded_terms text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.grant_search_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.grant_search_profiles(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('saved','hidden','rejected','restored','pursued')),
  reason text,
  note text,
  query_text text,
  rank_position integer,
  score_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, grant_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.grant_search_feedback_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.grant_search_profiles(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  reason text,
  note text,
  query_text text,
  rank_position integer,
  score_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_search_profiles TO authenticated;
GRANT SELECT, INSERT ON public.grant_search_feedback, public.grant_search_feedback_events TO authenticated;
GRANT ALL ON public.grant_search_profiles, public.grant_search_feedback, public.grant_search_feedback_events TO service_role;
ALTER TABLE public.grant_search_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_search_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_search_feedback_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gsp_self" ON public.grant_search_profiles;
CREATE POLICY "gsp_self" ON public.grant_search_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "gsf_self" ON public.grant_search_feedback;
CREATE POLICY "gsf_self" ON public.grant_search_feedback FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "gsfe_self" ON public.grant_search_feedback_events;
CREATE POLICY "gsfe_self" ON public.grant_search_feedback_events FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Grant search documents (vector-based semantic search)
CREATE TABLE IF NOT EXISTS public.grant_search_documents (
  grant_id uuid primary key references public.grants(id) on delete cascade,
  content_en text not null,
  content_fr text not null default '',
  content_hash text not null,
  embedding_model text,
  embedded_at timestamptz,
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.grant_search_documents TO authenticated;
GRANT ALL ON public.grant_search_documents TO service_role;
ALTER TABLE public.grant_search_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gsd_r" ON public.grant_search_documents;
CREATE POLICY "gsd_r" ON public.grant_search_documents FOR SELECT TO authenticated USING (true);
