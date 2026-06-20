CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('iial-rss-poll-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('iial-decay-stale-grants');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'iial-rss-poll-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app/api/public/hooks/rss-poll',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoc3ZuZWJ5d2FmZHJkZWhnZm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDI3OTgsImV4cCI6MjA5NzQ3ODc5OH0.K9XwyMkfPq2136pn9nx5l7-cDwoxTi3tZhEO9yiQ710"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  ) AS request_id;
  $cron$
);

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