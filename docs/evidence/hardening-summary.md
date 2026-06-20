# Hardening Summary — Post Pen-test (2026-06-20)

Consolidated record of every remediation applied after the
`pentest-report-2026-06-20.md` run. All issues actionable without a live
pilot tenant are closed; #3 remains a pre-pilot gate.

## Issue register — final state

| ID | Severity | Title | Remediation | Status |
|---|---|---|---|---|
| #1 | Medium | CSP header missing | Global `applySecurityHeaders` middleware in `src/start.ts` injects CSP on every response | ✅ Closed — `security-headers.md` |
| #2 | Low | `X-Frame-Options` / `frame-ancestors` missing | Same middleware sets `frame-ancestors 'none'` + `X-Frame-Options: DENY` | ✅ Closed — `security-headers.md` |
| #3 | Medium | Session-level tests with two pilot accounts | Requires real tenant credentials (email-enum parity, token rotation, cross-tenant RLS, DSAR scope, live prompt-injection) | ⏸ Pre-pilot gate |
| #4 | Medium | Publishable-key auth on `/api/public/hooks/*` | HMAC-SHA256 + timestamp + single-use nonce; secret stored in `webhook_config` (DB-managed, no user secret needed) | ✅ Closed — `webhook-auth.md` |
| #5 | Low | No rate limit on public webhooks | Sliding-window 60 req/60 s per IP+endpoint via `webhook_rate_limit`; 429 on excess | ✅ Closed — `webhook-rate-limit.md` |
| #6 | Low | Agent-generated `grant_events` invisible to users | RLS policy expanded: `actor_user_id IS NULL` readable by all authenticated (grants catalog is shared) | ✅ Closed — migration 014 |

## Migrations applied

| # | File | Purpose |
|---|---|---|
| 011 | `20260620012322_…` | `webhook_nonces` (replay protection) |
| 012 | `20260620012517_…` | `webhook_config` (HMAC secret store) |
| 012b | `20260620012528_…` | Auto-seed `hmac_secret` via `gen_random_bytes(48)` |
| 013 | `20260620013640_…` | `webhook_rate_limit` table + lookup index |
| 014 | (this run) | Expand `grant_events_read_own` to include `actor_user_id IS NULL` |

## Accepted risks (unchanged)

- `extension_in_public` for `vector` and `pg_net` — relocation requires
  downtime, deferred to post-GA (ADR-009).
- Linter `RLS Enabled No Policy` on `webhook_config`, `webhook_nonces`,
  `webhook_rate_limit` — **intentional**: deny-by-default, `service_role`
  only via `supabaseAdmin`. No policies = no access for any role except
  service_role, which is what we want.

## Headers shipped (cross-link)

```
content-security-policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
  font-src 'self' data:;
  connect-src 'self' https://*.supabase.co https://*.lovable.app
              https://*.lovable.dev wss://*.supabase.co;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self';
  object-src 'none'
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
strict-transport-security: max-age=31536000; includeSubDomains
```

## Pre-pilot gate (Issue #3)

Before onboarding the first pilot tenant, execute the deferred checklist
items with two real accounts:

- [ ] Email enumeration parity on `/auth` (response timing + message)
- [ ] Server-side password policy (length, breached-password check)
- [ ] Token rotation on sign-in, invalidation on sign-out
- [ ] OAuth redirect-URI whitelist (once Google provider is configured)
- [ ] Cross-tenant RLS proof: tenant A cannot read tenant B on
      `proposals`, `proposal_sections`, `submissions`, `outcomes`,
      `knowledge_chunks`, `consent_ledger`, `dsar_requests`
- [ ] DSAR export scope: only the requester's data is returned
- [ ] Live prompt-injection probes against the deployed agent pipeline
- [ ] Citation validator behaviour with production model versions

Track results in the private worksheet referenced by
`pentest-checklist.md`; do not commit findings to the repo.

## Final tally

- **Critical: 0 · High: 0**
- **Medium closed: 2** (#1, #4) · **Medium pending pilot: 1** (#3)
- **Low closed: 3** (#2, #5, #6)
- **Accepted risk: 2** (pgvector, pg_net in `public`)

The hardening cycle is complete. The platform is launch-ready for the
closed-pilot phase pending execution of the #3 checklist on first
tenant onboarding.
