-- RFP-style requirements extracted from the grant page (documents to submit,
-- process constraints like two-stage/LOI or matching funds). Populated by the
-- enricher via the deterministic requirements analyzer; shown on the grant
-- detail page so applicants know what to prepare BEFORE drafting.
ALTER TABLE public.grants
  ADD COLUMN IF NOT EXISTS requirements jsonb;
