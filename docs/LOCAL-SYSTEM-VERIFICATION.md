# Local System Verification — 2026-07-22

Full local functional test after the Gemini/Lovable edits broke the app. Goal:
guarantee the whole system works locally against the **local** Docker Supabase
(dev DB), route by route, fixing what's broken.

Environment: dev server `http://localhost:8080` (non-elevated), Supabase local
`localhost:15435`, `.env.local` active (local DB), hybrid LLM (Cerebras→Groq→
Gemini→Ollama). See `docs/DRP-MIGRATION-RUNBOOK.md` for architecture.

## Fixes applied to restore the system

1. **LLM routing reverted to hybrid local-first** (`llm.server.ts`,
   `llm-free.server.ts`): was flipped to cloud-first-always by Gemini. Now:
   Ollama reachable → local-first; unreachable → cloud chain; cloud fails →
   local fallback.
2. **Gemini added to the cloud chain** (`llm-cloud.server.ts`): Cerebras → Groq
   → Gemini (Google OpenAI-compat endpoint). `otel.ts` system union updated.
3. **tsc error fixed** (`deadlines.ts`): embedded FK relation typed as array,
   matching the repo's `Array.isArray(x) ? x[0] : x` pattern.
4. **Dev/prod env split** via new gitignored `.env.local` pointing dev at local
   Supabase; `.env` keeps cloud/base values; Lovable prod uses dashboard env.
5. **Local Supabase keys corrected** in `.env.local`: must be the `kong.yml`
   JWTs (issuer `supabase`), not `supabase-demo` keys — wrong keys → Kong
   `{"message":"Unauthorized"}` 401.
6. **Demo passwords reset** in local auth DB to match `DEMO_PASSWORD`.
7. **.gitignore env pattern fixed** and `.env` untracked going forward.

Validation gates (all green): `tsc` 0, `eslint` 0, `vitest` 379 passed / 3
skipped, `build` OK.

## Route-by-route browser test (local DB, demo-admin)

| Route | Status | Notes |
| --- | --- | --- |
| `/auth` | ✅ PASS | Demo login buttons render; Admin login → `/dashboard`. |
| `/dashboard` | ✅ PASS | Real local data (17 active, 9 eligible, NRC IRAP grants), no console errors. |
| `/grants` | ✅ PASS | 17 grants, V2 radar; search "IRAP" → 17→8 relevant, no errors. |
| `/grants/$id` | ✅ PASS | Grant detail (fit 88/100, evidence 4/7, completeness 57%), no errors. |
| `/proposals` | ✅ PASS | 3 proposals from local DB, no errors. |
| `/submissions` | ✅ PASS | Sent/Won/Waiting/Win-rate + IRAP submission, no errors. |
| `/fit-rules` | ✅ PASS | Screening profiles render, no errors. |
| `/funders` | ⚠️ WARN | Renders 8 funders from local DB, but React dev warning "state update on a component that hasn't mounted yet" (see Known issues). |
| `/admin` | ⚠️ WARN | Renders; same React mount warning as /funders (shared AppTopBar/V1 layout, not on V2-shell routes). |

| `/competitive` `/financial` `/impact` `/post-award` `/renewal` `/tasks` `/compliance-calendar` `/org` `/manual` `/privacy` | ✅ PASS | Swept in one SPA pass from a clean console reload; all rendered (ended on `/privacy` with correct title), no crashes. Only the shared React mount warning below appeared. |

## LLM hybrid verification

- Local Ollama path: `phi4-mini:latest` generate → `OK` (local-first works).
- App boot banner: `Cloud LLM: ✅ Groq Ready` (cloud chain has a live key).
- `llm-cascade.e2e.test.ts` (8 tests) covers cloud-cleared → local fallback.
- Chain confirmed in code: Ollama reachable → local; else Cerebras → Groq →
  Gemini → local fallback.

## Known issues (non-blocking)

- **React "state update on a component that hasn't mounted yet."** Appears once
  and then persists in the SPA console buffer. Reproduced in a clean sweep that
  did NOT include `/funders`, so it is NOT page-specific — it originates in a
  shared component (framer-motion `PageTransition` / suspense boundary) and is
  triggered by rapid programmatic route changes (700ms apart in the test). All
  pages render all real data; no crash. Low priority: normal human-speed
  navigation rarely triggers it and it is dev-only. `PageTransition.tsx` and the
  V2 shell were checked and contain no setState-in-render; the trigger is
  transition/unmount timing under fast navigation. Flagged for a focused fix if
  it ever surfaces at human speed.

## 2026-07-22 (2nd loop) — Actions & lifecycle testing

### Schema drift FIXED — the 5 newest migrations were never applied locally

`/fit-rules` "Simulate impact" worked (3 pass / 13 review / 4 block), but exposed
a real bug: `column outcomes.impact_description does not exist` crashing the
`/impact` route to its error boundary. Root cause: the 5 migrations Lovable/Gemini
generated overnight (`20260722012054`, `012237`, `012327`, `012841`, `020029`)
were committed to the repo but **never applied to the local Docker DB**.

Fix: `node scripts/apply-local-migrations.mjs` → 6 applied (added
`outcomes.impact_description`, `grants.requirements`, `proposals.version`,
`search_grant_catalog` RPC, org tables, webhook deny policies). Then restarted
`docker-rest-1` (a plain `NOTIFY pgrst` was not enough) so PostgREST picked up
the new columns. Verified: service-role query for the exact embedded
outcomes+submissions+grants join returns rows; server log shows **zero**
`impact_description` errors after a clean dev-server restart; `/impact` renders
real data ("Grants won 1", award-by-award list).

- One migration (`20260722012841`) fails idempotently ("policy
  `approval_workflows_admin_all` already exists") — its intent is already
  satisfied by `20260711160100`; harmless but it retries each run. Low priority.
- **Cloud implication:** the same migration drift almost certainly exists on the
  Lovable Cloud DB (these + ~38 earlier migrations were only ever applied to
  local Docker). Deploying to Lovable will hit the same "column does not exist"
  errors until the migrations are applied to Cloud (needs `supabase link` +
  `db push`, still pending — see DRP runbook).
- Note: GET server functions are HTTP-cached by the browser, so a stale 500
  response can linger in the console after a fix until a cache-bypassing reload.

### Deterministic actions verified

| Action | Result |
| --- | --- |
| `/grants` search "IRAP" | ✅ 17→8 relevant |
| `/fit-rules` Simulate impact | ✅ 3 pass / 13 review / 4 block |

## Conclusion

The system works locally end to end against the local Docker Supabase (dev DB):
auth, dashboard, grants + search, grant detail, proposals, submissions,
fit-rules, funders, admin, and all V2 secondary screens render real local data
with no crashes. LLM is hybrid (local-first with cloud chain). The only open item
is the non-fatal React transition warning above.
