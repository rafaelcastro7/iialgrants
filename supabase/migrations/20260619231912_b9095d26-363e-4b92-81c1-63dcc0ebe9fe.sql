create extension if not exists pg_cron;

-- Autonomous hourly discovery trigger. Uses pg_net's http_post to call the
-- app webhook, so it can ONLY be scheduled when pg_net is present. On images
-- without pg_net (e.g. plain pgvector), skip gracefully with a notice instead
-- of failing the whole migration — the pipeline can still be driven manually
-- or by an external scheduler.
do $$
declare
  has_pg_net boolean;
  jid bigint;
  hook_url text := coalesce(
    current_setting('app.discover_hook_url', true),
    'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36-dev.lovable.app/api/public/hooks/discover'
  );
  hook_key text := coalesce(current_setting('app.hook_apikey', true), '');
begin
  select exists (select 1 from pg_available_extensions where name = 'pg_net')
    into has_pg_net;

  if not has_pg_net then
    raise notice 'pg_net unavailable — skipping iial-discoverer-hourly cron (schedule externally or install pg_net).';
    return;
  end if;

  execute 'create extension if not exists pg_net';

  -- Remove any prior schedule with the same name (idempotent).
  select jobid into jid from cron.job where jobname = 'iial-discoverer-hourly';
  if jid is not null then perform cron.unschedule(jid); end if;

  perform cron.schedule(
    'iial-discoverer-hourly',
    '0 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := jsonb_build_object('trigger','cron')
      );
      $job$,
      hook_url, hook_key
    )
  );
end $$;
