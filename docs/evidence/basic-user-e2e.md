# Basic User E2E Verification — 2026-07-04

Verified the local basic-user flow against the real stack:

- `bun scripts/demo-seed.mjs` to ensure the seeded demo auth users exist.
- `bun run test:e2e` to exercise the browser path end to end.

## Flow checked

1. Open `/auth`
2. Use the `Member A` demo autologin button
3. Land on `/dashboard`
4. Open `/grants`
5. Switch from `Express` to `Advanced`
6. Confirm the filter surface renders and the mobile viewport stays within bounds

## Result

- Desktop flow passed.
- Mobile flow passed.
- No browser console/page errors were reported by the Playwright run.
- Local code audit with `qwen2.5-coder:3b` reported `0` reproducible findings on the touched auth, dashboard, grants, filters, and notification files.

## Navigation audit update - 2026-07-04

Added `tests/e2e/navigation-audit.spec.ts` for route-by-route browser coverage.
The test logs in with seeded demo accounts and clicks the user-facing links
instead of using direct URL jumps for the important paths:

- Member flow: dashboard -> grants -> advanced grant detail -> audit trail,
  then proposals, submissions, org profile, fit rules, privacy, and compliance.
- Admin flow: dashboard -> admin overview -> users -> modules -> agents ->
  sources -> candidates -> discovery history -> back to dashboard.

Issues found and fixed during this audit:

- `/grants/$id/audit` URL changed but audit content did not render until the
  parent grant detail route yielded to the child route.
- Background grant enrichment auto-opened the trace sheet and could block
  navigation clicks.
- Admin analytics referenced `ChartTooltip` without importing it.
- Admin history rendered duplicate keys when local seed data repeated IDs.

Latest verified result:

- `bun run lint` passed.
- `bun run build` passed.
- `bunx playwright test tests/e2e/navigation-audit.spec.ts` passed
  (`2 passed`) with no captured page errors or console errors.

## Local capability note

The local Supabase stack is configured for `http://localhost:8080`, so the Playwright browser smoke uses that origin rather than `127.0.0.1` to match the allowed CORS setup.

## Commands

```bash
bun run check:local
bun scripts/demo-seed.mjs
bun run test:e2e
bunx playwright test tests/e2e/navigation-audit.spec.ts
```
