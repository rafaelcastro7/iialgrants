-- Reset all grants and dependent data.
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Bypasses RLS because SQL Editor runs as postgres superuser.

-- 1. Delete dependent data (order matters for required FKs)
DELETE FROM evidence_spans;
DELETE FROM grant_evaluations;
DELETE FROM grant_events;
DELETE FROM outcomes;
DELETE FROM proposals;
DELETE FROM submissions;

-- 2. Delete nullable-FK data referencing grants
DELETE FROM agent_trace_steps WHERE grant_id IS NOT NULL;
DELETE FROM agent_runs WHERE grant_id IS NOT NULL;
DELETE FROM notifications WHERE grant_id IS NOT NULL;

-- 3. Delete all grants
DELETE FROM grants;

-- 4. Reset crawl_ledger fetch state so re-discovery works fresh
UPDATE crawl_ledger SET
  fetch_count = 0,
  error_count = 0,
  last_fetched_at = NULL,
  last_error = NULL,
  next_fetch_at = NOW();

-- 5. Verify counts
SELECT
  (SELECT count(*) FROM grants) AS grants_remaining,
  (SELECT count(*) FROM evidence_spans) AS evidence_remaining,
  (SELECT count(*) FROM grant_evaluations) AS evals_remaining,
  (SELECT count(*) FROM grant_events) AS events_remaining,
  (SELECT count(*) FROM proposals) AS proposals_remaining,
  (SELECT count(*) FROM submissions) AS submissions_remaining;
