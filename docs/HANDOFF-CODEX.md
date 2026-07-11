# Handoff for Codex / Claude - IIAL Grants

Living handoff so another agent can continue safely. Read this plus
`docs/DEVELOPER-GUIDE.md` first. Last updated: 2026-07-11
America/Toronto.

## Frontend V2 Redesign - 2026-07-11

User request: "realiza un rediseno completo del front... no quiero ver nada
de lo que hay... deja la que esta como version uno... crea desde cero la
version dos... investiga las mejores interfaces... usa modelos locales...
documenta todo."

What shipped:

- Added a persistent V1/V2 UI switch. V2 is the default; V1 remains available
  through `localStorage["iial.ui.version"]` and the visible V1/V2 toggle.
- Added the new authenticated V2 shell:
  `src/components/v2/V2AuthenticatedShell.tsx`.
  It replaces the old sidebar/topbar with an "Opportunity operating system"
  layout: workstream navigation, command search, lifecycle strip, local-only
  status, mobile sheet navigation, and sign-out/version controls.
- Preserved V1 instead of deleting it:
  `src/routes/_authenticated.tsx` chooses V2 shell by default, or the original
  `AppSidebar`/`SidebarProvider` shell when version is `v1`.
- Hid legacy route topbars only inside V2 via `.v1-app-topbar`; V1 still shows
  the original `AppTopBar`.
- Rebuilt the dashboard as a separate V2 presentation while leaving the old
  dashboard JSX available for V1. The V2 dashboard is a command center with:
  next-best action, local intelligence posture, active/eligible/deadline/
  pipeline metrics, opportunity queue, and activity stream.
- Added V2 global visual tokens in `src/styles.css`: new light/dark palette,
  8px radius, denser shadows, Work Sans headings inside V2, grid canvas, and
  V2-only card/radius overrides. This changes the visual language across all
  authenticated routes without destroying V1.
- Cleaned toolchain noise: `vite.config.ts` now uses Vite 8 native
  `resolve.tsconfigPaths` instead of the deprecated `vite-tsconfig-paths`
  plugin path, and `scripts/live-audit-daemon.mjs` was formatted to restore a
  clean lint result.

Research used:

- Instrumentl positions grant work as an operating system: one workspace to
  find, write, manage, and collaborate on grants.
  Source: https://www.instrumentl.com/
- Fluxx emphasizes role-based dashboards, visibility, accountability, and
  centralized grant workspaces.
  Source: https://www.fluxx.io/about-us and
  https://www.fluxx.io/grantelligence-grants-management
- Foundant GLM emphasizes the full grant lifecycle in one configurable system.
  Source:
  https://www.foundant.com/products/grant-management-software-for-foundations/
- Grants.gov lifecycle language informed the V2 lifecycle strip
  (pre-award/apply, award, post-award/reporting).
  Source: https://www.grants.gov/learn-grants/grants-101/the-grant-lifecycle

Important: the implementation clones interaction/information patterns, not
proprietary pixels or assets.

Local-model note:

- Tried to use local Ollama for a design critique:
  `opencode-fast:latest` timed out after ~184s, `phi4-mini:latest` timed out
  after ~124s, and `deepseek-r1:1.5b` timed out after ~94s. `ollama ps` showed
  models loaded on GPU but not returning usable text. Models were stopped with
  `ollama stop ...`. No cloud LLMs were used. Treat this as an Ollama
  interactive-runtime issue to investigate separately; it did not block the
  UI work.

Verification:

- `bun run lint` OK, no warnings.
- `bun run build` OK. Remaining build output is non-blocking: TanStack plugin
  timing info and a pre-existing large client entry chunk warning
  (`index-*.js` around 753 kB). The obsolete `vite-tsconfig-paths` warning is
  gone.
- Browser verification through demo Admin login on `http://localhost:8080`:
  V2 rendered at `/dashboard`, old `.v1-app-topbar` was absent/hidden, no
  console/page errors, grants loaded, and screenshots were written to
  `test-results/v2-dashboard-loaded.png` and
  `test-results/v2-dashboard-mobile.png`.
- Mobile check at 390x844: no horizontal overflow and H1 punctuation fixed.

Known follow-up debt:

- V2 phase 1 covers the authenticated shell, global theme/tokens, and dashboard
  rebuild. Deep route interiors inherit the V2 shell/theme but are not all
  individually rewritten yet. Next best follow-up: rebuild Grant Detail,
  Grants Index, Proposal Detail, and Admin pages as V2-native work surfaces.
- The large entry chunk warning remains. Fixing it likely means deeper
  route-level/dynamic import work or adjusting TanStack Start code-splitting;
  do not hide it by merely raising the warning limit.
- Investigate why direct `ollama run` design prompts timed out even for
  small/local models while `ollama ps` showed loaded models.

## Bitacora Para Codex/Claude - 2026-07-11

Current HEAD after this update should be on top of (newest first):

- `98ca0db` feat(ops): add local-only live audit daemon
- `ad1be3c` fix(fit-rules): screening simulation reflects the AI-trust weight; honest funder trend
- `b2bc907` fix(admin): surface hidden errors, timestamps, and identity across admin pages
- `4b2eef2` fix(proposals): stop stale-review and fake-data gaps in the submit gate
- `decf550` fix(pipeline): close grounding and status-transition gaps in discovery/evaluation
- `cdc1cb2` fix(security): require admin role on audit-trail and approval-workflow endpoints
- `179a918` fix: 7 bugs found testing every screen end-to-end as a first-time user
- `3c28447` fix(funders): label raw CRA category/designation codes instead of showing bare numbers/letters
- `394999c` redesign(nav): group the sidebar's 19 flat items into 7 sections

What changed in this loop — an Ultracode Workflow ran a 6-dimension audit
(admin sub-pages × 3, discoverer/enricher logic, evaluator/fit-rules logic,
proposal-lifecycle logic) each independently verified by a second agent
reading the actual current source before being trusted. All 31 raised
findings survived verification; every one was fixed directly (not deferred),
grouped into 6 commits above. Highlights, most severe first:

- **Auth bypass (critical, `cdc1cb2`)**: `audit-trail.functions.ts` (3
  handlers) and `approval-workflows.functions.ts` (5 handlers) used the
  service-role client but only checked `requireSupabaseAuth`, never
  `assertAdmin` — any authenticated non-admin could read the full audit
  trail, forge audit rows, or create/submit/approve compliance workflows.
  RLS on both tables was also `USING (auth.role() = 'authenticated')` —
  tightened to `has_role(..., 'admin')` in two new migrations. Also fixed
  `getApprovalWorkflows` to embed `steps`/`instances` (the Approve/Reject
  panel was permanently empty) and added a step-builder UI (workflows were
  always created with zero steps, so the chain could never gate anything).
- **Ungrounded LLM writes (critical, `decf550`)**: Discovery's LLM
  extraction (`discoverer.impl.server.ts`) has no `snippetIsGrounded` check
  — unlike the enricher — so a hallucinated amount/deadline written at
  discovery time became permanent, since the enricher's gap-fill only
  targets fields that are still `null`. Now Discovery always inserts
  `null` for `amount_cad_min`/`amount_cad_max`/`deadline`; the grounded
  enricher path is the only writer for those two fields.
- **Fake "Expert Review Panel" (critical, `4b2eef2`)**:
  `multi-expert-review.functions.ts`'s `scoreProposal` was a hardcoded stub
  returning score=5 with empty findings for all 6 reviewers regardless of
  input, presented as a real independent assessment — and its always-empty
  `findings` fed a Revision Plan page that then reported "no findings" as
  false reassurance even after a "review" ran. Replaced with one real LLM
  call (reuses the `critic` agent slot — adding a new `AgentName` was out of
  scope) that grounds every finding in the actual section text; partial
  responses are honestly marked "not reviewed" rather than defaulted to a
  score.
- **Stale critic score (critical, `4b2eef2`)**: redrafting a proposal
  section never invalidated `proposals.critic_score` — `canSubmit()` could
  pass on a critic review of content that no longer exists. Now nulls it on
  every redraft.
- **Silent fit_score drop (high, `decf550`)**: `evaluator.impl.server.ts`'s
  auto-archive-on-fail status check only handled 3 of 5 reachable statuses,
  and — the real bug — nested the `fit_score` DB write inside that same
  incomplete check, so re-evaluating a `shortlisted`/`in_proposal` grant
  silently dropped the fresh score entirely (not just skipped the archive).
  Fixed using `canTransition(status, "archived")` from
  `pipeline-stages.shared.ts` instead of a hand-rolled list, and hoisted the
  `fit_score` write out so it's unconditional.
- **Wrong audit-page rules (high, `decf550`)**: `grant-audit.functions.ts`
  (the page whose whole job is explaining why a grant was accepted/
  archived) evaluated against generic `DEFAULT_RULES` instead of
  `deriveRulesFromOrg()` — could show different pass/fail reasoning than
  what the real evaluator actually used.
- **Discovery-history + monitoring blind spots (`b2bc907`)**: job-completion
  summary row read the wrong metadata keys (always showed zeros); no
  funder identity or `agent_runs.error` shown anywhere in the Recent
  Discoverer Runs list; "running" status rendered as a red destructive
  badge; `admin-sources-audit.functions.ts`'s "last discovery" was derived
  from `MAX(grants.discovered_at)` (frozen at first insert) instead of the
  real `funders.last_discovered_at` — a funder scanned successfully every
  day with zero new grants looked permanently stale. Background Jobs on
  `/admin/monitoring` queried an un-time-boxed top-50-platform-wide window,
  so a high-frequency agent could push a low-frequency one out of the table
  entirely — verified live: `discoverer` and `strategist` were both
  actually missing at the time of the audit despite having real historical
  runs.
- **Screening-rules simulation was inert (`ad1be3c`)**: the Live Impact
  preview on `/fit-rules` ranked grants by raw `rule_score` alone, so
  dragging "Trust the AI vs. the rules" from 0 to 1 changed nothing —
  byte-identical results either way. Now blends in each grant's real
  `grant_evaluations.fit_score` via the same `combined_score()` the live
  evaluator uses.
- **Funder "Trend: Stable" was a lie by omission**: `getGivingTrend()`
  returned `"stable"` both for a genuinely flat trend AND for "not enough
  priced-grant data to measure any trend" — now distinguishes the two.
- Also fixed this loop: `SubmitDialog`'s "Submit Anyway" discarding the
  user's actual method/confirmation number; `requirementLooksCovered()`'s
  one-word substring match that could falsely clear a critical requirement;
  `submit-gate.shared.ts`'s dead `readinessScore` field (never checked,
  despite being displayed right next to the Submit button); Agent Console's
  "Updated" timestamp sourced from the wrong table; admin Users list
  silently truncating at 200 with no pagination; `admin.modules.tsx`
  claiming disabled modules "hide from navigation and block server
  functions" when nothing enforced either (wired `submissions` and
  `grants_discovery` to real enforcement, corrected the copy for the rest).

Also ran the full batch pipeline (`RUN_BATCH_PIPELINE=1 bunx vitest run
src/agents/batch-pipeline.test.ts`) against all 11 grants that were stuck at
max enrich attempts before this session's earlier context-budget/pinning
fixes (reset `enrich_attempts=0` first). Result: all 11 honestly failed with
`enrichment_insufficient` (critical fields genuinely not extractable from
the scraped pages) — this is CORRECT behavior, not a regression; the
grounding gate is doing its job rather than fabricating numbers. Evaluation
of 5 other already-enriched grants succeeded normally (scores 0.68-0.73).
These 11 grants likely need better source URLs or manual data entry; leaving
them as-is is the honest outcome.

Validation for this loop:

- `bunx tsc --noEmit`: 0 errors (checked after every file group, not just
  once at the end).
- `bunx eslint src/`: 0 errors (one `--fix` pass needed for prettier
  formatting on the multi-line edits).
- `bunx vitest run` (live/batch tests skip by default via their env-gate):
  262 passed, 4 skipped, 0 regressions — including 2 new
  `submit-gate.test.ts` cases for the `low_readiness` reason.
- Two new migrations applied locally via
  `DATABASE_URL=postgresql://postgres:...@localhost:15432/postgres node
  scripts/apply-local-migrations.mjs`, then `NOTIFY pgrst, 'reload schema'`.

Working-tree notes (still true):

- `scripts/local-audit.mjs` still shows as modified on Windows purely from
  autocrlf/EOL — `git diff --quiet -- scripts/local-audit.mjs` returns `0`.
  Do not include it unless there is a real diff.
- Pre-existing untracked artifacts remain intentionally out of scope:
  `admin-modules.png`, `admin-modules-2.png`, `audit-report/`,
  `synthetixvideo-audit-report.md` — these are leftovers from an unrelated
  task (a different client's security audit), not part of this project.
- New this loop: `scripts/live-audit-daemon.mjs` (committed, `98ca0db`) — a
  persistent local-only background loop (process health + code audit +
  data-coherence checks) requested by Rafael; findings append to
  `scripts/live-audit-report.log` (gitignored); state in
  `scripts/.live-audit-state.json` (now gitignored too).

Next high-value work (deliberately scoped out this loop, still open):

- `admin_modules` only has real enforcement wired for `submissions` and
  `grants_discovery`; `evaluator`/`strategist`/`writer`/`critic` overlap
  with the separate per-agent `agent_flags` mechanism (used by
  `assertAgentEnabled`) and `rag_org_profile`/`public_webhooks` are still
  unenforced. Untangling whether `module_flags` and `agent_flags` should
  merge into one mechanism is a real but separate architectural question.
- Discovery's grounding fix only covers `amount_cad_min`/`amount_cad_max`/
  `deadline` (the two highest-stakes numeric fields). `summary`/
  `eligibility`/`sectors` are still inserted from Discovery's ungrounded
  LLM extraction without a snippet check — lower stakes (free text /
  used softly in fit-scoring, not a hard numeric gate) but the same class
  of gap.
- `applicant_types_allowed` in `fit-rules.shared.ts` is documented as dead
  (stored/validated, never read by `evaluateRules()`, not exposed in the
  Screening Rules UI) rather than wired or removed — low severity, zero UI
  exposure today, but worth a real decision eventually.
- Keep local-first invariant: no cloud LLM providers, no external token
  spend. The new `scoreProposal` expert-panel call and everything above ran
  entirely on local Ollama (`dolphin3:latest`).

## Bitacora Para Claude - 2026-07-09

Current HEAD after this handoff update should be on top of:

- `b8d4575` redesign(grant-detail): replace Express view with grant dossier
- `76db6ff` fix(pipeline): preserve official deep pages when search fails
- `dc39fca` fix(writer): stream slow Ollama drafting calls
- `b4a3fef` fix(migration): make RLS-scoping migration idempotent
- `91b6a10` fix(security): close remaining cross-tenant read leaks
- `154d13c` fix(security): stop org_id=NULL proposals/submissions leaking across users
- `3e3567f` redesign(grant-detail): hero decision card + recommendation line
- `92a60b9` fix(agents): native Ollama /api/chat and observable strategist/critic failures
- `7f417cb` fix(writer): bounded generation + first slow-agent timeout floor

What changed in the latest loop:

- `b8d4575` replaces the grant detail Express page again after user rejected
  the previous visual direction. The new surface is a grant dossier, not a
  marketing-style hero: decision state, lifecycle, key facts, extraction
  warning, grant facts summary list, eligibility/fit, application package,
  focus areas, data quality, source links, and timeline. The route now passes
  language, enriched/scored/last-seen timestamps, source sightings, events, and
  a fetch-details action into the Express component.
- Real UI verification for `b8d4575`: opened
  `http://localhost:8080/grants/7f00b146-7b75-483e-8613-da644a34d3e7` as demo
  Admin in Playwright on desktop 1440px and mobile 390px. H1 loaded as
  "Capital of Development"; decision/data-quality/grant-facts sections were
  present; console/page errors were zero after waiting for demo auth correctly.
- Design basis used for `b8d4575`: summary-list style key facts, progressive
  disclosure of diagnostics, and grant-lifecycle thinking. Sources consulted:
  NN/g progressive disclosure, GOV.UK summary list/details, Grants.gov grant
  terminology/lifecycle, and Instrumentl's lifecycle grant-work positioning.
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

DONE as of 2026-07-11: Admin/security audit (`src/routes/_authenticated.
admin.*.tsx`, `src/lib/admin-*.functions.ts`, `approval-workflows.
functions.ts`, `audit-trail.functions.ts`) — see the 2026-07-11 bitacora
above for the full list of auth-bypass and observability fixes. Also
covered: discoverer/enricher/evaluator/fit-rules/proposal-lifecycle logic.

Highest-value next work:

- Source ingester audit: `funder-scout`, `gc-proactive`, `t3010`, `otf`,
  `alberta-ckan`, and high-volume dedup/quality edge cases. (Not yet
  covered by the 2026-07-11 pass — that pass covered `discoverer.impl.
  server.ts`/`discoverer-orchestrator.server.ts` directly but not the
  individual source-curator ingesters under `src/lib/source-curator/`.)
- UX/i18n follow-up: wire a real proposal detail FR mode/toggle so FR export
  paths are user-reachable.
- See "Next high-value work" in the 2026-07-11 bitacora above for the
  specific items deliberately scoped out of that pass (module_flags vs
  agent_flags duplication, Discovery grounding for summary/eligibility/
  sectors, dead `applicant_types_allowed` field).

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
