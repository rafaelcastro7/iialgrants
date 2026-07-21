-- Keep proposal financial tracking in sync with generated Supabase types.
-- Existing code expects this column when joining budgets -> proposals.
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS budget_total_cad numeric;
