CREATE TABLE public.webhook_rate_limit (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  client_ip TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_rate_limit_lookup_idx ON public.webhook_rate_limit (endpoint, client_ip, seen_at DESC);
GRANT ALL ON public.webhook_rate_limit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.webhook_rate_limit_id_seq TO service_role;
ALTER TABLE public.webhook_rate_limit ENABLE ROW LEVEL SECURITY;
-- No policies: deny-by-default. Only service_role (which bypasses RLS) can access.