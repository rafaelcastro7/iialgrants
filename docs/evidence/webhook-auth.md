# Webhook authentication — HMAC + timestamp + nonce

Status: **active** · Closes pen-test Issue #4 (2026-06-20).

All `/api/public/hooks/*` endpoints require a signed request. The previous
scheme (Supabase publishable key in the `apikey` header) was removed — the
key is browser-readable and offered no replay protection.

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

## Caller example (pg_cron, Node, bash)

```bash
TS=$(date +%s)
NONCE=$(openssl rand -hex 16)
BODY='{}'
SIG=$(printf "%s.%s.%s" "$TS" "$NONCE" "$BODY" \
  | openssl dgst -sha256 -hmac "$WEBHOOK_HMAC_SECRET" -hex | awk '{print $2}')

curl -X POST https://project--{id}.lovable.app/api/public/hooks/discover \
  -H "x-iial-timestamp: $TS" \
  -H "x-iial-nonce: $NONCE" \
  -H "x-iial-signature: $SIG" \
  -H "content-type: application/json" \
  --data "$BODY"
```

## Operational notes

- **Secret rotation:** rotate `WEBHOOK_HMAC_SECRET` quarterly or after any
  suspected exposure. After rotation, redeploy/restart the worker and update
  every caller (pg_cron, external schedulers).
- **Clock skew:** callers should sync via NTP. The ±5-minute window
  tolerates typical drift without enabling long-window replay.
- **Nonce collisions:** with 128 bits of entropy the birthday bound is
  negligible. Callers MUST generate a fresh nonce per request
  (`crypto.randomUUID()` or `openssl rand -hex 16`).
- **Body integrity:** signature is over the exact raw body. Any proxy that
  re-serializes JSON will break verification — keep the body byte-identical
  end-to-end.

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
