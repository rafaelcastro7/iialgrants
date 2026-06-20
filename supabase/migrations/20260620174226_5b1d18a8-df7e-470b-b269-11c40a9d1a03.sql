SELECT cron.alter_job(job_id := 1, active := false);
SELECT cron.alter_job(job_id := 2, active := false);
UPDATE public.agent_runs SET status='failed', error='stale_running_gc' WHERE status='running' AND created_at < now() - interval '30 minutes';