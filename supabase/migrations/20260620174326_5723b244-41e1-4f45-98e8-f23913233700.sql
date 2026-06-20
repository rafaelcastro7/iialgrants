SELECT cron.unschedule('iial-discoverer-hourly');
SELECT cron.unschedule('iial-enricher-15min');

SELECT cron.schedule('iial-discoverer-hourly','0 * * * *',$$
  WITH p AS (
    SELECT EXTRACT(EPOCH FROM NOW())::bigint::text AS ts,
           encode(gen_random_bytes(16),'hex') AS nonce,
           '{"trigger":"cron"}'::text AS body,
           (SELECT value FROM public.webhook_config WHERE key='hmac_secret') AS secret
  )
  SELECT net.http_post(
    url := 'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app/api/public/hooks/discover',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-iial-timestamp', p.ts,
      'x-iial-nonce', p.nonce,
      'x-iial-signature', encode(extensions.hmac(p.ts || '.' || p.nonce || '.' || p.body, p.secret, 'sha256'),'hex')
    ),
    body := p.body::jsonb
  ) FROM p;
$$);

SELECT cron.schedule('iial-enricher-15min','*/15 * * * *',$$
  WITH p AS (
    SELECT EXTRACT(EPOCH FROM NOW())::bigint::text AS ts,
           encode(gen_random_bytes(16),'hex') AS nonce,
           '{"trigger":"cron"}'::text AS body,
           (SELECT value FROM public.webhook_config WHERE key='hmac_secret') AS secret
  )
  SELECT net.http_post(
    url := 'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app/api/public/hooks/enrich',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-iial-timestamp', p.ts,
      'x-iial-nonce', p.nonce,
      'x-iial-signature', encode(extensions.hmac(p.ts || '.' || p.nonce || '.' || p.body, p.secret, 'sha256'),'hex')
    ),
    body := p.body::jsonb
  ) FROM p;
$$);

SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='iial-discoverer-hourly'), active := false);
SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='iial-enricher-15min'), active := false);