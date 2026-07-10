# Handoff for Codex / Claude - IIAL Grants

Living handoff so another agent can continue safely. Read this plus
`docs/DEVELOPER-GUIDE.md` first. Last updated: 2026-07-09
America/Toronto.

## Bitacora Para Claude - 2026-07-09

Current HEAD after this handoff update should be on top of:

- `76db6ff` fix(pipeline): preserve official deep pages when search fails
- `dc39fca` fix(writer): stream slow Ollama drafting calls
- `b4a3fef` fix(migration): make RLS-scoping migration idempotent
- `91b6a10` fix(security): close remaining cross-tenant read leaks
- `154d13c` fix(security): stop org_id=NULL proposals/submissions leaking across users
- `3e3567f` redesign(grant-detail): hero decision card + recommendation line
- `92a60b9` fix(agents): native Ollama /api/chat and observable strategist/critic failures
- `7f417cb` fix(writer): bounded generation + first slow-agent timeout floor

What changed in the latest loop:

- Grant detail Express view was rebuilt earlier into a professional
  decision-brief surface: hero recommendation, fit/eligibility/amount/deadline
  snapshot, next action sidebar, clearer section names, and wider route
  container.
- Multi-tenant security audit closed real cross-tenant reads:
  org_id=NULL proposals/submissions stopped leaking, proposal citations,
  agent trace steps, proposal reviews, compliance matrices, and citation
  reports were scoped to proposal/run owners. Write-side IDOR was tested:
  member A could not update admin proposal sections.
- Migrations `20260709100000`, `20260709110000`, and `20260709120000` were
  made/rechecked as idempotent and registered locally.
- Writer local-Ollama drafting was hardened in `dc39fca`:
  slow agents use streaming `/api/chat` reads, unloaded models are prewarmed,
  writer timeout floor is 600s, writer output is capped at 450 tokens, prompt
  contract forbids title-only output, and `agent_runs.model` logs the actual
  model instead of a hardcoded value.
- Real writer validation:
  warm PSCE `Expected Impact` succeeded in about 210s; cold PSCE `Budget`
  succeeded in about 411s using `dolphin3:latest`, wrote 735 chars, and logged
  a succeeded `agent_runs` row with 387 output tokens.
- Deep-crawl search honesty was fixed in `76db6ff`:
  `gatherDeepMarkdown()` no longer throws away already scraped first-party
  pages when third-party Jina/site-search fails. Search failure is reported via
  optional `onSearchError`, and the enricher records `deep_crawl_search`
  warnings instead of collapsing the whole deep-crawl result.
- The full Vitest run before `76db6ff` formally passed, but exposed hidden
  evaluator timeouts: batch evaluator calls were aborting at the 120s env
  baseline while the test still reported success. `76db6ff` puts evaluator on
  the slow local-Ollama streaming path with a 300s floor. Targeted batch
  validation after the fix scored all 3 evaluator cases successfully
  (latencies observed: ~239s, ~216s, ~73s).

Validation already run for the latest state:

- `bunx tsc --noEmit` OK
- `bun run lint` OK
- `bunx vitest run src/lib/deep-crawl.test.ts src/lib/deep-crawl.gather.test.ts --reporter=verbose`
  OK, 6 tests passed
- `bunx vitest run src/agents/batch-pipeline.test.ts --reporter=verbose`
  OK, enrichment 15/15 skipped as expected due max attempts, evaluator 3/3
  succeeded
- `bunx vitest run --reporter=verbose` was run before the evaluator timeout
  floor fix: 254 passed, 2 skipped, but the output contained the now-fixed
  evaluator timeout symptom
- `bun run build` OK after the evaluator/deep-crawl fixes

Important working-tree notes:

- `scripts/local-audit.mjs` may appear as modified on Windows because of
  autocrlf/EOL metadata. It has no real diff: `git diff --quiet --
  scripts/local-audit.mjs` returned `0`, and its working hash matched
  `HEAD:scripts/local-audit.mjs`. Do not include it unless there is a real diff.
- Pre-existing untracked artifacts are intentionally outside scope:
  `admin-modules.png`, `admin-modules-2.png`, `audit-report/`,
  `synthetixvideo-audit-report.md`.
- `.remember/now.md` and `.remember/today-2026-07-09.md` were updated locally,
  but `.remember/*` is ignored by design.
- The skill heuristic file outside the repo was updated:
  `C:\Users\rafae\.codex\skills\grant-scraping-improvement\references\heuristics.md`
  now records that search-provider failures must not discard already scraped
  official pages.

Next high-value work for Claude:

- Re-run full Vitest only when willing to spend several minutes on local
  Ollama; the targeted batch evaluator test is the better smoke for this
  class of timeout.
- If evaluator remains too slow, investigate routing/config tradeoffs
  (`dolphin3:latest` honesty vs `phi4-mini` speed) before changing model
  assignments.
- Continue grant scraping improvements empirically: inspect failed
  `agent_runs`/attempt trails, classify failure layer first, then patch the
  smallest structural rule.
- Keep local-first invariant: no cloud LLM providers, no external token spend.

## Current State

Latest commits (newest first):

- `4131924` feat: S3c proposal DOCX/PDF export and versioning
- `18fca5c` docs: handoff update - S3a browser-verified, desync fix, C5-pt2 verified done
- `1ecdbf3` fix: submitProposal grant-status desync (found via browser test)
- `30d0c7c` feat: S3a reviewer-simulation submit gate
- `b3aa3f3` fix: S3b FR export no longer passes English off as French + remove dead code

Quality bar after `4131924`: tsc 0, eslint 0, 222 unit/e2e tests + 1 skipped,
production build clean, Playwright E2E 5/5. Live pipeline smoke was green
earlier on 2026-07-05 (fit_score ~0.76 against local Supabase + Ollama).

Local migration applied during verification:
`supabase/migrations/20260705160000_proposal_version_bump.sql`
(`bump_proposal_version`) was applied to local `docker-db-1` and verified under
role `authenticated` with `auth.uid()`.

## Roadmap Status

DONE: QW1 (rule_score/deadline), QW3 (secrets guard test), QW4 (React Query
optimistic), C1 (org-vs-grant rules), C2 (interactive board), C3 (deadline
reminders + NotificationBell), C4 (pipeline analytics), C6 (audit-log
immutability), S1 (multi-axis fit + shareable report), S2 (RFP requirements +
readiness), Express/Advanced UX, 7-bug logic reengineering pass, C5 part 1
(dedup hardening), C5 part 2 (CA source wiring verified), S3a, S3b, and S3c.

## Completed S3 Work

### S3a - Submit quality gate - DONE (`30d0c7c`, verified/fixed by `1ecdbf3`)

Implemented pure `canSubmit()` + `MIN_CRITIC_SCORE_TO_SUBMIT` (0.6) in
`src/lib/submissions.functions.ts`. `submitProposal` computes readiness and
blocks with typed `submit_blocked:<reasons>` unless `force: true`. The proposal
detail route explains the reasons and offers "submit anyway".

Covered by `src/lib/submit-gate.test.ts` (7 tests). Browser-verified
end-to-end: block dialog -> "submit anyway" force path -> grant and proposal
both submitted. That browser run found and fixed a real grant/proposal status
desync in `1ecdbf3`.

### S3b - FR export honesty - DONE (`b3aa3f3`)

Extracted pure `buildProposalMarkdown()` in `src/lib/submissions.functions.ts`.
Untranslated sections are flagged inline and returned in `missingTranslations`
instead of silently passing English off as French.

S3c now routes exports through `exportProposalFile`, which preserves
`missingTranslations`; the UI will surface missing FR translations once the
proposal detail route is wired to a real FR toggle. Today the route still
hardcodes `const fr = false` (EN-only UI), so FR toggle wiring remains a
separate UX/i18n task.

### S3c - DOCX/PDF export + real versioning - DONE (`4131924`)

Implemented:

- `exportProposalFile` with `md`, `docx`, and `pdf` formats.
- Server-side DOCX generation through `docx` and PDF generation through
  `pdf-lib`; files return base64 + MIME type + filename for browser download.
- Advanced proposal UI now offers Export Markdown, Export DOCX, and Export PDF.
- Atomic PostgreSQL RPC `bump_proposal_version(target_proposal_id)` with RLS.
- Writer re-drafts, critic reviews, and submit transitions now bump
  `proposals.version` through that RPC.
- Fixed a real DOM hydration warning found by the new export E2E: `Badge`
  (`div`) had been nested inside a `p` on the proposal detail metadata row.
- Playwright E2E now runs with `workers: 1`; local Supabase/Auth produced
  transient fetch failures when E2E files ran concurrently. This matches the
  one-by-one navigation audit requirement and stabilized the suite.

Coverage:

- `src/lib/proposal-export.test.ts` validates Markdown/DOCX/PDF output and file
  signatures (`PK` for DOCX, `%PDF-` for PDF).
- `src/lib/proposal-versioning.test.ts` validates the RPC wrapper, DB error
  handling, and empty-result guard.
- `tests/e2e/proposal-export.spec.ts` logs in through the UI, opens the
  proposal Advanced view, downloads all three formats, verifies filenames and
  binary signatures, and asserts no browser console/page errors.

## C5 Part 2

C5-pt2 needs no code change. `tri_council` is wired in
`src/lib/source-curator/orchestrator.server.ts` (Tier B), and local
`discovery_sources_registry` has tri_council plus the 11 CA sources enabled.
Empty `last_run_at` means discovery has not been triggered locally (crons are
staged inactive), not a code gap.

## Remaining Audit Targets

Highest-value next work:

- Admin/security audit: `src/routes/_authenticated.admin.*.tsx`,
  `src/lib/admin-*.functions.ts`, server functions missing
  `requireSupabaseAuth`/`assertAdmin`, share-token surfaces, and broad RLS
  policies.
- Source ingester audit: `funder-scout`, `gc-proactive`, `t3010`, `otf`,
  `alberta-ckan`, and high-volume dedup/quality edge cases.
- UX/i18n follow-up: wire a real proposal detail FR mode/toggle so FR export
  paths are user-reachable.

## Verification Protocol

Run before every commit:

```bash
bun x tsc --noEmit
bun x eslint .
bun x vitest run --exclude "**/live-*"
bun run build
bun run test:e2e
```

For UI changes, verify in browser at http://localhost:8080 through the demo
buttons on `/auth`. For pipeline changes, run the live smoke
(`scripts/seed-live-grant.mjs` then `src/agents/live-pipeline.test.ts` with
`LIVE_GRANT_ID`/`LIVE_USER_ID`).

## Local-First Auditing

Use local Ollama before spending cloud tokens:

```bash
node scripts/local-audit.mjs qwen2.5-coder:7b [relative/file.ts]
```

It writes `scripts/local-audit-report.json`; revert this scratch churn after
reading. The 7B model over-reports race/null issues. Triage every finding
against real code before acting. During S3c, it found one real-ish edge
(`bumpProposalVersion` empty RPC result), now fixed and tested; subsequent
null-result finding was a false positive because the typed error is intentional.

## Hard Rules

- Do NOT rewrite published git history. This branch is connected to Lovable.
- Do NOT bypass the immutable audit-log trigger (`reject_audit_mutation`) on
  `agent_runs`/`grant_events`.
- Before editing the pipeline state machine (`pipeline-stages.shared.ts`),
  inspect the live DB trigger:
  `docker exec docker-db-1 psql -U postgres -d postgres -c "\sf validate_grant_transition"`.
- List route files MUST use `.index.tsx`; otherwise detail `$id` routes can
  silently fail to render.
- `MAX_ENRICH_ATTEMPTS` lives in `pipeline-stages.shared.ts` (client-safe), not
  `enricher.functions.ts`.
- Keep scratch artifacts out of git (`.playwright-mcp/`, screenshots,
  `test-results/`, `scripts/local-audit-report.json` churn).
