
-- Internal webhook plumbing: only service_role touches these. Add explicit
-- deny policies so the linter is satisfied and intent is documented.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_nonces','webhook_config','webhook_rate_limit'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service role only" ON public.%I', t);
    EXECUTE format('CREATE POLICY "service role only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
