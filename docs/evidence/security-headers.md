# Security headers

Status: **active** · Closes pen-test Issue #1 (2026-06-20).

Applied by `requestMiddleware` in `src/start.ts` to every response from the
worker (HTML, server-fn JSON, public webhooks, error pages).

| Header | Value |
|---|---|
| `content-security-policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.lovable.app https://*.lovable.dev wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` |
| `x-frame-options` | `DENY` |
| `x-content-type-options` | `nosniff` |
| `referrer-policy` | `strict-origin-when-cross-origin` |
| `permissions-policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `strict-transport-security` | `max-age=31536000; includeSubDomains` |

## Notes

- `'unsafe-inline'` is permitted on `style-src` (Tailwind runtime), but
  **not** on `script-src`. Inline scripts will fail-closed.
- `connect-src` whitelists the Supabase Data API + Realtime and the Lovable
  AI Gateway. Add new external origins explicitly when integrating them.
- `frame-ancestors 'none'` + `x-frame-options: DENY` provide defense in
  depth against clickjacking — the modern header is enforced by Chrome/
  Firefox/Safari; the legacy one covers older WebViews.
- Existing route handlers may set their own headers; the middleware uses
  `headers.has(k)` so it never overrides an explicit per-route header.
