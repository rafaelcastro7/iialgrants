-- Internal config store for webhook HMAC secret.
-- Read only by service_role (verifier in worker + pg_cron jobs via SECURITY DEFINER fn).
CREATE TABLE IF NOT EXISTS public.webhook_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_config TO service_role;
ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;
-- Deny-by-default: no policies for anon/authenticated.

-- Seed a random 384-bit secret if not present. pgcrypto is already
-- available (used elsewhere via gen_random_uuid).
INSERT INTO public.webhook_config (key, value)
SELECT 'hmac_secret', encode(gen_random_bytes(48), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.webhook_config WHERE key = 'hmac_secret');

-- SECURITY DEFINER accessor so pg_cron jobs can fetch the secret
-- without granting table access to the cron role directly.
CREATE OR REPLACE FUNCTION public.get_webhook_secret()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.webhook_config WHERE key = 'hmac_secret'
$$;

-- Only service_role may call it (pg_cron runs as superuser → also fine).
REVOKE ALL ON FUNCTION public.get_webhook_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_webhook_secret() TO service_role;
