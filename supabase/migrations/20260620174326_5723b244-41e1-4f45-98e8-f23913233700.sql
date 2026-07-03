-- HMAC-signed autonomous webhooks (discoverer + enricher). Supersedes the
-- plain-apikey cron jobs. Every call needs pg_net's http_post, so the whole
-- block is guarded: on images without pg_net it skips gracefully instead of
-- failing the migration. Jobs are created inactive (active := false) — staged
-- for manual activation once pg_net + a reachable hook URL are in place.
DO $$
declare
  has_pg_net boolean;
  hook_base text := coalesce(
    current_setting('app.hook_base_url', true),
    'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app'
  );
begin
  select exists (select 1 from pg_available_extensions where name = 'pg_net')
    into has_pg_net;

  if not has_pg_net then
    raise notice 'pg_net unavailable — skipping HMAC-signed discoverer/enricher cron jobs.';
    return;
  end if;

  execute 'create extension if not exists pg_net';

  begin perform cron.unschedule('iial-discoverer-hourly'); exception when others then null; end;
  begin perform cron.unschedule('iial-enricher-15min');   exception when others then null; end;

  perform cron.schedule('iial-discoverer-hourly','0 * * * *', format($job$
    WITH p AS (
      SELECT EXTRACT(EPOCH FROM NOW())::bigint::text AS ts,
             encode(gen_random_bytes(16),'hex') AS nonce,
             '{"trigger":"cron"}'::text AS body,
             (SELECT value FROM public.webhook_config WHERE key='hmac_secret') AS secret
    )
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-iial-timestamp', p.ts,
        'x-iial-nonce', p.nonce,
        'x-iial-signature', encode(extensions.hmac(p.ts || '.' || p.nonce || '.' || p.body, p.secret, 'sha256'),'hex')
      ),
      body := p.body::jsonb
    ) FROM p;
  $job$, hook_base || '/api/public/hooks/discover'));

  perform cron.schedule('iial-enricher-15min','*/15 * * * *', format($job$
    WITH p AS (
      SELECT EXTRACT(EPOCH FROM NOW())::bigint::text AS ts,
             encode(gen_random_bytes(16),'hex') AS nonce,
             '{"trigger":"cron"}'::text AS body,
             (SELECT value FROM public.webhook_config WHERE key='hmac_secret') AS secret
    )
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-iial-timestamp', p.ts,
        'x-iial-nonce', p.nonce,
        'x-iial-signature', encode(extensions.hmac(p.ts || '.' || p.nonce || '.' || p.body, p.secret, 'sha256'),'hex')
      ),
      body := p.body::jsonb
    ) FROM p;
  $job$, hook_base || '/api/public/hooks/enrich'));

  perform cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='iial-discoverer-hourly'), active := false);
  perform cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='iial-enricher-15min'), active := false);
end $$;
