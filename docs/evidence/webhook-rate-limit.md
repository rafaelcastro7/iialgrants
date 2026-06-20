# Webhook rate limiting

Status: **active** · Closes pen-test Issue #5 (2026-06-20).

Sliding-window per-IP, per-endpoint limit applied inside
`verifyWebhookRequest()` (`src/lib/webhook-auth.server.ts`) before HMAC
verification, so floods are deflected cheaply.

| Parameter | Value |
|---|---|
| Window | 60 s |
| Max requests | 60 per IP per endpoint |
| Storage | `public.webhook_rate_limit` (service_role only, RLS deny-by-default) |
| Client IP | `cf-connecting-ip` → `x-forwarded-for[0]` → `x-real-ip` → `"unknown"` |
| Response on excess | `429 rate_limited` |

## Notes

- pg_cron callers share the Cloudflare edge IP — well below the 60/min
  cap (discover runs hourly, enrich every 15 min, deadlines daily).
- Old rows are GC'd best-effort each call (`seen_at < now() - 120 s`).
- The limit is per endpoint, so a flood against `/discover` does not
  starve `/enrich` from the same IP.
- Layered with Cloudflare's default per-IP throttle — this is an
  application-layer backstop, not the only line of defense.
