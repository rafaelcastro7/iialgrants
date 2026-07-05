# Handoff for Codex — IIAL Grants

Living handoff so another agent (Codex) can continue when Claude's token budget
runs out. Read this + `docs/DEVELOPER-GUIDE.md` first. **Last updated: 2026-07-05.**

## Current state (all pushed to `main`)

Latest commits (newest first):

- `b3aa3f3` fix: S3b FR export no longer passes English off as French + remove dead code
- `18d5715` docs: Codex handoff
- `0c69b55` docs: C5 dedup hardening + local-audit triage guidance
- `8c0d989` fix: C5 dedup hardening — collapse funder-name title variants, block admin pages
- `d624bc0` test: guard against new secrets in migrations (QW3)

Working tree is clean. Quality bar right now: **tsc 0, eslint 0, 208 unit/e2e
tests + 1 skipped, build clean.** Live pipeline smoke green (fit_score ~0.76
against local Supabase + Ollama).

## Roadmap status (from `.claude/plans/precious-exploring-pelican.md`)

DONE: QW1 (rule_score/deadline), QW3 (secrets guard test), QW4 (React Query
optimistic), C1 (org-vs-grant rules), C2 (interactive board), C3 (deadline
reminders + NotificationBell), C4 (pipeline analytics), C6 (audit-log
immutability), S1 (multi-axis fit + shareable report), S2 (RFP requirements +
readiness), plus the whole Express/Advanced UX and a 7-bug logic reengineering
pass and C5 part 1 (dedup hardening).

REMAINING (pick up here, highest value first):

### S3a — Submit quality gate (NOT yet implemented)

`submitProposal` in `src/lib/submissions.functions.ts` (lines 19-61) moves a
grant `in_proposal → submitted` and the proposal to `submitted` with **no
quality gate at all**. The plan calls for a reviewer-simulation gate.

Concrete, verified facts to build the gate:

- `proposals.critic_score` is `numeric`, scale **0-1** (schema:
  `CriticOutput.overall_score = z.number().min(0).max(1)` in
  `src/agents/schemas.ts:157`; persisted at `src/agents/critic.functions.ts:78`).
- Readiness is a pure 0-100 function: `computeProposalReadiness` in
  `src/lib/proposal-readiness.ts` (returns `{ score, openCriticalRequirements }`).
- Suggested gate (confirm threshold with Rafael): block submit when
  `critic_score == null` (never reviewed) OR `critic_score < 0.6` OR
  `readiness.openCriticalRequirements.length > 0`. Return a typed error the UI
  can show (e.g. `throw new Error("submit_blocked:low_quality")`), and surface
  it in `src/routes/_authenticated.proposals.$id.tsx` (the `onSubmit` handler).
- Add a regression test (pure): a low-critic-score proposal is rejected, a
  ready one passes. Consider exporting a pure `canSubmit(proposal, readiness)`
  helper so it's unit-testable without the DB.

### S3b — FR export silently falls back to EN — DONE (`b3aa3f3`)

Fixed: extracted pure `buildProposalMarkdown()` in
`src/lib/submissions.functions.ts`; untranslated sections are flagged inline
and returned in a new `missingTranslations` field. Covered by
`src/lib/proposal-export.test.ts` (5 tests). OPTIONAL follow-up: surface
`missingTranslations` in the proposal-detail UI export button (the route reads
`{markdown, filename}` and ignores the new field today). Note the route
hardcodes `const fr = false` (EN-only UI) so the FR path isn't user-reachable
yet — wiring a real FR toggle is separate work.

### S3c — DOCX/PDF export + real versioning

Currently markdown-only, `proposals.version` is an integer that nothing
increments meaningfully. Lower priority than S3a/S3b.

### C5 part 2 — Wire dormant CA sources

`tri_council` ingester exists (`src/lib/source-curator/tri-council.server.ts`)
but verify it's actually wired into the orchestrator and enabled. No QC/BC
foundation ingesters yet.

### Dead code — DONE (`b3aa3f3`)

Removed the duplicate `listNotifications`/`markNotificationRead` from
`submissions.functions.ts` (the live, user_id-scoped versions stay in
`notifications.functions.ts`).

## Verification protocol (run before every commit)

```bash
bun x tsc --noEmit
bun x eslint .
bun x vitest run --exclude "**/live-*"
bun run build
```

For UI changes, verify in-browser at http://localhost:8080 (login via demo
Admin button on /auth; use `browser_tabs action:new` for an isolated tab — a
shared Playwright/Codex session may be navigating the same browser). For
pipeline changes, run the live smoke (`scripts/seed-live-grant.mjs` then
`src/agents/live-pipeline.test.ts` with LIVE_GRANT_ID/LIVE_USER_ID).

## Local-first auditing (save cloud tokens)

`node scripts/local-audit.mjs qwen2.5-coder:7b [relative/file.ts]` runs a
zero-cloud-token audit via Ollama (localhost:11434), writing
`scripts/local-audit-report.json` (git-revert this scratch file after). **The
7B model over-reports "race condition" — every finding needs triage against
the real code before acting.** In the 2026-07-05 sweep, all 38 raw findings
triaged to zero real bugs.

## Hard rules (do not violate)

- Do NOT rewrite published git history (branch connected to Lovable).
- Do NOT bypass the immutable audit-log trigger (`reject_audit_mutation`) — it
  correctly blocks deletes/updates on `agent_runs`/`grant_events` even for
  service_role. Deleting a grant referenced by `agent_runs` will fail; that's
  intended.
- Before editing the pipeline state machine (`pipeline-stages.shared.ts`),
  check the LIVE DB trigger: `docker exec docker-db-1 psql -U postgres -d
  postgres -c "\sf validate_grant_transition"` — later migrations supersede
  earlier ones.
- List route files MUST use `.index.tsx` (or the detail `$id` route silently
  never renders).
- `MAX_ENRICH_ATTEMPTS` lives in `pipeline-stages.shared.ts` (client-safe), not
  `enricher.functions.ts` (which bundles `createServerFn`).
- Keep scratch artifacts out of git (`.playwright-mcp/`, screenshots,
  `scripts/local-audit-report.json` churn).
