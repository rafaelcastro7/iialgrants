do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'iial-enricher-15min';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'iial-enricher-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36-dev.lovable.app/api/public/hooks/enrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoc3ZuZWJ5d2FmZHJkZWhnZm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDI3OTgsImV4cCI6MjA5NzQ3ODc5OH0.K9XwyMkfPq2136pn9nx5l7-cDwoxTi3tZhEO9yiQ710'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);