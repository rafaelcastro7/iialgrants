
-- 1. Source registry: catalog of every ingestor
CREATE TABLE public.discovery_sources_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key text NOT NULL UNIQUE,
  label text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('A_daily','B_weekly','C_monthly','scout')),
  format text NOT NULL,
  source_url text,
  cadence_cron text,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  rows_30d integer NOT NULL DEFAULT 0,
  candidates_30d integer NOT NULL DEFAULT 0,
  auto_approved_30d integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_sources_registry TO authenticated;
GRANT ALL ON public.discovery_sources_registry TO service_role;

ALTER TABLE public.discovery_sources_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage discovery sources registry"
  ON public.discovery_sources_registry FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_dsr_updated_at
  BEFORE UPDATE ON public.discovery_sources_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Health summary view (last 30 days)
CREATE OR REPLACE VIEW public.source_health_summary AS
SELECT
  dataset,
  COUNT(*) AS runs,
  COUNT(*) FILTER (WHERE status='succeeded')::float / NULLIF(COUNT(*),0) AS success_rate,
  COALESCE(SUM(rows_in),0)::int AS rows_in_total,
  COALESCE(SUM(candidates_out),0)::int AS candidates_total,
  COALESCE(SUM(auto_approved),0)::int AS auto_approved_total,
  COALESCE(SUM(errors),0)::int AS errors_total,
  AVG(latency_ms)::int AS avg_latency_ms,
  MAX(run_at) AS last_run_at
FROM public.source_ingest_runs
WHERE run_at >= now() - interval '30 days'
GROUP BY dataset;

GRANT SELECT ON public.source_health_summary TO authenticated;

-- 3. Funder yield view
CREATE OR REPLACE VIEW public.funder_source_yield AS
SELECT
  f.id AS funder_id,
  f.name,
  f.source_type,
  COUNT(g.id) AS grants_total,
  COUNT(g.id) FILTER (WHERE g.created_at >= now() - interval '30 days') AS grants_30d,
  MAX(g.created_at) AS last_grant_at
FROM public.funders f
LEFT JOIN public.grants g ON g.funder_id = f.id
GROUP BY f.id, f.name, f.source_type;

GRANT SELECT ON public.funder_source_yield TO authenticated;

-- 4. Auto-promote stale candidates
CREATE OR REPLACE FUNCTION public.auto_promote_stale_candidates()
RETURNS TABLE(promoted_id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM public.funder_candidates
    WHERE status='pending_review'
      AND score >= 70
      AND array_length(source_signals,1) >= 2
      AND discovered_at <= now() - interval '7 days'
    LIMIT 50
  LOOP
    INSERT INTO public.funders (name, name_fr, country, jurisdiction, website, source_url, source_type, bn_number, disbursed_annual, active)
    VALUES (rec.name, rec.name_fr, 'CA', rec.province, rec.website, rec.website, 'manual', rec.bn_number, rec.disbursed_annual, true)
    ON CONFLICT DO NOTHING;
    UPDATE public.funder_candidates
      SET status='approved', reviewed_at=now(), reviewed_by=NULL
      WHERE id=rec.id;
    promoted_id := rec.id;
    name := rec.name;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 5. Seed registry with canonical sources
INSERT INTO public.discovery_sources_registry
  (dataset_key, label, tier, format, source_url, cadence_cron, notes) VALUES
  ('tbs_gc',       'TBS Proactive Disclosure of G&C',           'C_monthly','ckan_sql', 'https://open.canada.ca/data/api/3/action/datastore_search_sql', '0 4 1 * *',  'Federal grants & contributions; mines past recipients as funder signals'),
  ('pfc_members',  'Philanthropic Foundations Canada members',  'C_monthly','html_scrape','https://pfc.ca/en/members/', '0 5 1 * *',  'Foundation member directory'),
  ('t3010_charities','CRA T3010 charity registry (foundations)', 'C_monthly','ckan_sql', 'https://open.canada.ca/data/dataset/80c00cdb-1358-415c-bb8b-0de7f12675b8', '0 6 1 * *', 'Public + private foundations with disbursement > $500k'),
  ('bbf_programs', 'Innovation Canada — Business Benefits Finder','B_weekly','xlsx',     'https://open.canada.ca/data/dataset/4e75337e-70d0-4ed7-92d1-3b85192ec6b1', '0 4 * * 1', 'Live funding programs (federal + provincial)'),
  ('eu_ft_portal', 'EU Funding & Tenders Portal',               'B_weekly','rest_json','https://api.tech.ec.europa.eu/search-api/prod/rest/search', '15 4 * * 1', 'Horizon Europe calls open to Canadian partners'),
  ('grants_gov',   'Grants.gov RSS (US cross-border)',          'A_daily', 'rss',      'https://www.grants.gov/rss/GG_NewOppByCategory.xml',         '0 3 * * *',  'US federal opportunities open to international partners'),
  ('idrc_rss',     'IDRC funding RSS',                          'A_daily', 'rss',      'https://www.idrc.ca/en/rss.xml',                             '5 3 * * *',  'International Development Research Centre'),
  ('otf_open',     'Ontario Trillium Foundation open data',     'C_monthly','csv',      'https://otf.ca/open',                                         '0 7 1 * *', 'Quarterly CSV of past OTF grants'),
  ('alberta_ckan', 'Alberta Open Government — grant disclosure','C_monthly','ckan_sql', 'https://open.alberta.ca/api/3/action/package_search',         '0 8 1 * *', 'Provincial grant disclosure'),
  ('tri_council',  'NSERC + SSHRC + CIHR live opportunities',   'B_weekly','html_scrape','https://www.nserc-crsng.gc.ca,https://www.sshrc-crsh.gc.ca,https://cihr-irsc.gc.ca','30 4 * * 1','Federal research councils'),
  ('funder_scout', 'Web-wide LLM funder scout',                 'scout',   'web_search','https://s.jina.ai/',                                          '0 5 * * 1', 'Capability-driven queries to discover unknown funders')
ON CONFLICT (dataset_key) DO NOTHING;
