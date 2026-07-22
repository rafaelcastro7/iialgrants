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
