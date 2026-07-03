-- Persist the deterministic multi-axis fit breakdown so the grant detail UI can
-- show WHY a grant scored what it did (eligibility/geography/sector/budget/
-- timeline sub-scores + reasons), instead of one opaque number.
ALTER TABLE public.grant_evaluations
  ADD COLUMN IF NOT EXISTS axis_breakdown jsonb;
