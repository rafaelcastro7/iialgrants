CREATE EXTENSION IF NOT EXISTS pg_cron;

-- decay-stale-grants is pure SQL (no pg_net) → always schedule it.
DO $$
BEGIN
  PERFORM cron.unschedule('iial-decay-stale-grants');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'iial-decay-stale-grants',
  '15 3 * * *',
  $cron$
  UPDATE public.grants
     SET status = 'expired',
         updated_at = NOW()
   WHERE status IN ('discovered', 'enriched', 'scored')
     AND last_seen_at < NOW() - INTERVAL '30 days'
     AND (deadline IS NULL OR deadline < CURRENT_DATE);
  $cron$
);

-- rss-poll-hourly uses pg_net's http_post → only schedule when pg_net exists.
-- On images without pg_net, skip gracefully instead of failing the migration.
DO $$
declare
  has_pg_net boolean;
  hook_url text := coalesce(
    current_setting('app.rss_hook_url', true),
    'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app/api/public/hooks/rss-poll'
  );
  hook_key text := coalesce(current_setting('app.hook_apikey', true), '');
begin
  select exists (select 1 from pg_available_extensions where name = 'pg_net')
    into has_pg_net;

  if not has_pg_net then
    raise notice 'pg_net unavailable — skipping iial-rss-poll-hourly cron (schedule externally or install pg_net).';
    return;
  end if;

  execute 'create extension if not exists pg_net';

  begin
    perform cron.unschedule('iial-rss-poll-hourly');
  exception when others then null;
  end;

  perform cron.schedule(
    'iial-rss-poll-hourly',
    '0 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := jsonb_build_object('source','pg_cron')
      );
      $job$,
      hook_url, hook_key
    )
  );
end $$;
