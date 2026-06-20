DO $$ BEGIN PERFORM cron.unschedule('iial-expire-past-deadlines'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'iial-expire-past-deadlines',
  '0 2 * * *',
  $cron$
  UPDATE public.grants
     SET status = 'expired', updated_at = NOW()
   WHERE status IN ('discovered','enriched','scored','shortlisted')
     AND deadline IS NOT NULL
     AND deadline < CURRENT_DATE;
  $cron$
);