CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop old cron jobs if re-running
DO $$ BEGIN PERFORM cron.unschedule('iial-deadlines-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('iial-archive-expired-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 1) Daily deadline reminder (HMAC-signed call to /api/public/hooks/deadlines).
SELECT cron.schedule(
  'iial-deadlines-daily',
  '0 12 * * *',
  $cron$
  WITH p AS (
    SELECT EXTRACT(EPOCH FROM NOW())::bigint::text AS ts,
           encode(gen_random_bytes(16), 'hex') AS nonce,
           '{"source":"pg_cron"}'::text AS body,
           (SELECT value FROM public.webhook_config WHERE key='hmac_secret') AS secret
  )
  SELECT net.http_post(
    url := 'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app/api/public/hooks/deadlines',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-iial-timestamp', p.ts,
      'x-iial-nonce', p.nonce,
      'x-iial-signature', encode(extensions.hmac(p.ts || '.' || p.nonce || '.' || p.body, p.secret, 'sha256'), 'hex')
    ),
    body := p.body::jsonb
  ) FROM p;
  $cron$
);

-- 2) Weekly archive: expired for > 14 days → archived.
SELECT cron.schedule(
  'iial-archive-expired-weekly',
  '0 3 * * 1',
  $cron$
  UPDATE public.grants
     SET status='archived', updated_at=NOW()
   WHERE status='expired'
     AND updated_at < NOW() - INTERVAL '14 days';
  $cron$
);

-- 3) Partial index for cheap catalog reads (excludes archived).
CREATE INDEX IF NOT EXISTS grants_active_status_deadline_idx
  ON public.grants (status, deadline NULLS LAST, fit_score DESC NULLS LAST)
  WHERE status <> 'archived';