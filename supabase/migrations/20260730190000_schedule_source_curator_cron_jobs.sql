-- Schedules the 3 funder-candidate discovery webhooks that already existed
-- as fully-built routes (source-tier-a, source-tier-b, source-curator) but
-- had no pg_cron job at all — confirmed live 2026-07-30 against the real
-- cron.job table (only iial-discoverer-hourly, iial-enricher-15min,
-- iial-rss-poll-hourly, and the deadline/archive/decay jobs existed). The
-- source-curator orchestrator had accordingly never run once: 0 rows in
-- source_ingest_runs, 0 in funder_candidates, before this session's manual
-- trigger. Same apikey-header auth as iial-rss-poll-hourly/
-- iial-deadlines-daily (these three routes check `apikey`, not the newer
-- HMAC scheme used by discover/enrich) and the same
-- current_setting()-with-fallback pattern for the base URL, so this behaves
-- correctly both in production (falls back to the deployed app) and locally
-- once app.hook_base_url/app.hook_apikey are set for this database (see the
-- ALTER DATABASE companion statement applied directly to the local dev DB —
-- not included here since the local anon key is an environment secret, not
-- something to hardcode into a migration that also runs in production).
--
-- Tier A: daily, low-cost RSS/JSON polls. Tier B + scout: weekly. Tier C:
-- monthly (matches the tiering already documented in
-- source-curator/orchestrator.server.ts's own header comment).
DO $$
declare
  has_pg_net boolean;
  hook_base text := coalesce(
    current_setting('app.hook_base_url', true),
    'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app'
  );
  hook_key text := coalesce(current_setting('app.hook_apikey', true), '');
begin
  select exists (select 1 from pg_available_extensions where name = 'pg_net')
    into has_pg_net;

  if not has_pg_net then
    raise notice 'pg_net unavailable — skipping source-curator cron jobs (schedule externally or install pg_net).';
    return;
  end if;

  execute 'create extension if not exists pg_net';

  begin perform cron.unschedule('iial-source-tier-a-daily');    exception when others then null; end;
  begin perform cron.unschedule('iial-source-tier-b-weekly');   exception when others then null; end;
  begin perform cron.unschedule('iial-source-curator-monthly'); exception when others then null; end;

  perform cron.schedule(
    'iial-source-tier-a-daily',
    '0 6 * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := jsonb_build_object('source','pg_cron')
      );
      $job$,
      hook_base || '/api/public/hooks/source-tier-a', hook_key
    )
  );

  perform cron.schedule(
    'iial-source-tier-b-weekly',
    '0 7 * * 1',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := jsonb_build_object('source','pg_cron')
      );
      $job$,
      hook_base || '/api/public/hooks/source-tier-b', hook_key
    )
  );

  perform cron.schedule(
    'iial-source-curator-monthly',
    '0 8 1 * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := jsonb_build_object('source','pg_cron')
      );
      $job$,
      hook_base || '/api/public/hooks/source-curator', hook_key
    )
  );
end $$;
