-- Replay-protection nonces for HMAC-authenticated public webhooks.
-- Used by /api/public/hooks/* to enforce single-use signatures within
-- the timestamp tolerance window.
CREATE TABLE IF NOT EXISTS public.webhook_nonces (
  nonce text PRIMARY KEY,
  endpoint text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_nonces_seen_at_idx
  ON public.webhook_nonces (seen_at);

-- No app-role access; only service_role (admin client in webhooks) writes here.
GRANT ALL ON public.webhook_nonces TO service_role;

ALTER TABLE public.webhook_nonces ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies for anon/authenticated. service_role bypasses RLS.
