# Webhook authentication — HMAC + timestamp + nonce

Status: **active** · Closes pen-test Issue #4 (2026-06-20).

All `/api/public/hooks/*` endpoints require a signed request. The previous
scheme (Supabase publishable key in the `apikey` header) was removed — the
key is browser-readable and offered no replay protection.

**Secret storage.** The HMAC secret lives in `public.webhook_config`
(deny-by-default RLS, `service_role` only) — generated automatically on
first migration with `gen_random_bytes(48)`. No environment variable, no
user-managed secret. Both the worker verifier and `pg_cron` jobs read it
from the database.

## Required headers

| Header | Description |
|---|---|
| `x-iial-timestamp` | Unix seconds (string). Request rejected if ±300s outside server clock. |
| `x-iial-nonce` | Opaque random string, 16–128 chars, `[A-Za-z0-9_-]`. Single-use within 600s. |
| `x-iial-signature` | Hex HMAC-SHA256 over `${ts}.${nonce}.${rawBody}` using `WEBHOOK_HMAC_SECRET`. |

## Verification flow (server)

1. Read raw body (`request.text()`).
2. Reject if any header missing or malformed (401).
3. Reject if `|now - ts| > 300s` (401 `timestamp_out_of_window`).
4. Recompute HMAC; `timingSafeEqual` against provided signature (401 `signature_mismatch`).
5. Insert nonce into `public.webhook_nonces` (PK). PK conflict → 401
   `nonce_replay`. Garbage-collect rows older than 600s on each call.

Implementation: `src/lib/webhook-auth.server.ts`.
Nonce store: `public.webhook_nonces` (service_role only; deny-by-default RLS).

## Caller example (pg_cron via pg_net)

```sql
DO $$
DECLARE
  ts text := extract(epoch from now())::bigint::text;
  nonce text := encode(gen_random_bytes(16), 'hex');
  body text := '{}';
  secret text;
  sig text;
BEGIN
  SELECT value INTO secret FROM public.webhook_config WHERE key = 'hmac_secret';
  sig := encode(hmac(ts || '.' || nonce || '.' || body, secret, 'sha256'), 'hex');
  PERFORM net.http_post(
    url := 'https://project--{id}.lovable.app/api/public/hooks/discover',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-iial-timestamp', ts,
      'x-iial-nonce', nonce,
      'x-iial-signature', sig
    ),
    body := body::jsonb
  );
END$$;
```

## Operational notes

- **Secret rotation:** `UPDATE public.webhook_config SET value = encode(gen_random_bytes(48),'hex'), rotated_at = now() WHERE key = 'hmac_secret';` — takes effect immediately; no redeploy needed.
- **Clock skew:** callers should sync via NTP. The ±5-minute window
  tolerates typical drift without enabling long-window replay.
- **Nonce collisions:** with 128 bits of entropy the birthday bound is
  negligible. Callers MUST generate a fresh nonce per request.
- **Body integrity:** signature is over the exact raw body. Any proxy that
  re-serializes JSON will break verification.

## Failure-mode mapping (401 reasons)

| Reason | Meaning |
|---|---|
| `missing_signature_headers` | One of the three headers absent. |
| `invalid_nonce_format` | Length or charset failed validation. |
| `invalid_timestamp` | Non-numeric `x-iial-timestamp`. |
| `timestamp_out_of_window` | Clock skew > 300s. |
| `invalid_signature_encoding` | Signature not valid hex. |
| `signature_mismatch` | HMAC did not match. |
| `nonce_replay` | Nonce already seen in the window. |
| `webhook_secret_not_configured` | `WEBHOOK_HMAC_SECRET` missing on server (500). |
