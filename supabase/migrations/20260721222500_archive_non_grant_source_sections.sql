-- Remove first-party advice, loan/equity, criteria, and historical-report
-- pages from the active grant queue. Archive rather than delete so discovery
-- provenance remains auditable. Never override evaluated or human workflow
-- states.
update public.grants
set
  status = 'archived',
  enrich_last_error = 'archived_non_grant_source_section',
  updated_at = now()
where status = 'discovered'
  and (
    url ~* '^https?://([^/]+\.)?investquebec\.com/fr/(accompagnement/|financement/(investissement|prets?)(/|$))'
    or url ~* '^https?://([^/]+\.)?mitacs\.ca/(services/|mitacs-supported-eligible-research-and-adjudication-criteria)'
    or url ~* '/(values?-ethics?|planification-rapports|planning-reporting)/'
  );

comment on column public.grants.enrich_last_error is
  'Last enrichment diagnostic; archived_non_grant_source_section marks advice, loan/equity, criteria, or historical-report pages removed from the active grant queue.';
