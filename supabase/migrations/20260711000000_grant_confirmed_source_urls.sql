-- Pins the deep-crawl detail-page URLs the enricher already confirmed as
-- relevant (passed pageLooksRelevantToGrant) for a grant, so a retry can
-- re-fetch the SAME pages instead of re-running discovery from scratch.
-- Discovery (gatherDeepMarkdown's inline-links -> HTML -> sitemap -> live web
-- search cascade) is not run-to-run stable — a live uncached search step can
-- surface different pages on different attempts, so the same grant URL could
-- legitimately yield different real source text, and the (itself 100%
-- deterministic) amount extractor then reports different real numbers each
-- time. Content is still re-fetched fresh on every attempt (funder pages do
-- get updated) — only page DISCOVERY is skipped once a set is confirmed.
ALTER TABLE public.grants
  ADD COLUMN IF NOT EXISTS confirmed_source_urls jsonb;
