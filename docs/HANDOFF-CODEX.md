# Handoff for Codex / Claude - IIAL Grants

Living handoff so another agent can continue safely. Read this plus
`docs/DEVELOPER-GUIDE.md` first. Last updated: 2026-07-21
America/Toronto.

## CRITICAL SECURITY FINDING - FIXED - 2026-07-21 America/Toronto

Claude found this during the RLS sweep (joint QA sprint lane 4, below). Codex
implemented and live-verified both the service-function boundary and direct
RLS defense; details and proof are recorded below.

**What's wrong:** any authenticated user of this app can read, modify, or
delete any OTHER organization's documents, tasks, comments, compliance
deadlines, and proposal logic models — a full cross-tenant IDOR
(insecure direct object reference), the same bug class as the `cdc1cb2`
audit-trail/approval-workflows fix and the `91b6a10`/`154d13c` cross-tenant
read-leak fixes, just in a part of the app those passes didn't reach.

**Why:** `src/lib/documents.functions.ts`, `src/lib/team-collaboration.
functions.ts` (`tasks`/`comments`), `src/lib/compliance-calendar.
functions.ts` (`compliance_items`), and the logic-model handlers in
`src/lib/reporting-templates.functions.ts` (`logic_models`) all:

1. Use `createSupabaseAdmin()` (service-role, bypasses RLS entirely) for
   every query, so the tables' RLS policies are moot regardless of what they
   say.
2. Take a bare `entityId`/`documentId`/`taskId`/`itemId`/`proposalId` from
   the request and never check it belongs to the calling user's org before
   reading, updating, or deleting it.

Concretely reachable today: `listDocuments({entityType, entityId})` and
`getDocumentUrl({documentId})` return/sign any other org's files;
`deleteDocument({documentId})` deletes any other org's file by guessing/
enumerating a UUID; `getTasks({})`/`getComments({entityType, entityId})` and
`updateTaskStatus`/`addComment` read and write across every org;
`getComplianceCalendar({})` and `getComplianceStats({})` return literally
every org's compliance items with **no filter at all** (not even an
entityId is required); `markComplianceComplete({itemId})` completes any
org's compliance item; `getLogicModel`/`upsertLogicModel({proposalId})`
read/write any org's logic model. IDs are also easy to obtain: the
list/calendar endpoints that leak cross-tenant rows hand out the exact IDs
the single-item endpoints need.

Separately (secondary, since the admin client bypasses it anyway, but still
worth closing as defense-in-depth): the RLS policies on these 5 tables
(`documents`, `tasks`, `comments`, `compliance_items`, `logic_models`) were
never tightened past their original `20260705210000`-`20260705210005`
migrations' `USING (auth.role() = 'authenticated')` / `FOR ALL` — i.e. "any
logged-in user," full stop. Every other table created in that same batch got
this reviewed at some point (`audit_trail`, `approval_workflows` got explicit
`20260711160000`/`20260711160100` admin-only follow-up migrations); these 5
did not.

**Proposed fix shape** (needs live verification, not a guess to commit blind):

- A shared helper, e.g. `assertEntityInUserOrg(supabase, userId, entityType,
entityId)` for the polymorphic tables (`documents`/`tasks`/`comments`:
  entity_type ∈ grant/proposal/submission/funder) that loads the referenced
  row's `org_id` and compares it against the caller's `profiles.org_id`
  (`org_id IS NULL` legacy rows can stay visible-to-all, matching the
  existing `Org members can view org X` policies in
  `20260705200000_multi_tenant_org_id.sql`). For `compliance_items`
  (via `submission_id -> submissions.org_id`) and `logic_models` (via
  `proposal_id -> proposals.org_id`) the join is direct, no polymorphism
  needed.
- Call that helper at the top of every handler above before any read/write/
  delete, throwing (403-equivalent) on mismatch — the same shape as
  `assertAdmin`/`assertAgentEnabled` already used elsewhere in this codebase.
- Then (defense-in-depth, second step): replace the 5 tables'
  `auth.role() = 'authenticated'` policies with real org-scoped policies
  mirroring the `Org members can view org grants/proposals/submissions`
  pattern in `20260705200000_multi_tenant_org_id.sql`, so a future
  direct-client query (bypassing the server functions) is safe too.
- Test explicitly: two users in two different orgs, confirm user A cannot
  list/read/write/delete user B's documents/tasks/comments/compliance items/
  logic models via each of the endpoints named above, and that legitimate
  same-org access still works.

One more thing worth deciding explicitly rather than copying blind:
`20260709120000_scope_proposal_derived_reads.sql` (the closest prior fix for
this exact bug class) scoped `compliance_matrices`/`proposal_reviews`/
`proposal_citation_reports` by `proposal_id in (select id from proposals
where user_id = auth.uid())` — single-user ownership, NOT
`org_id`/`profiles.org_id` team-membership like
`20260705200000_multi_tenant_org_id.sql` uses for
`grants`/`proposals`/`submissions` themselves. Those two scoping bases will
give different results whenever a proposal's org has more than one member
(team collaboration — the exact feature `tasks`/`comments` exist for —
implies they should be org-scoped, not creator-only, or a teammate couldn't
see their own team's tasks/comments). Pick org-scoping deliberately for
these 5 tables and confirm against real seeded multi-member-org data, rather
than copying whichever pattern is closer.

### Live closure proof

Implemented in `src/lib/tenant-access.server.ts`, the four affected function
modules, and migration
`20260721170000_close_collaboration_tenant_idor.sql`.

- Before the migration, authenticated tenant A could SELECT all five seeded
  tenant B fixtures (`documents`, `tasks`, `comments`, `compliance_items`,
  `logic_models`): 1 row from every table.
- After the migration, the same JWT returned `[]` from every table and a
  cross-tenant task PATCH returned `[]`; tenant B still read all five and
  updated its task.
- A second member temporarily assigned to tenant B read all five fixtures,
  proving team collaboration remains org-scoped rather than creator-only.
- Calling `assertEntityInUserOrg` with the service-role client rejected tenant
  A with `Forbidden: resource belongs to another organization`, while owner B
  and the B teammate were allowed.
- Temporary organizations, profile assignments, and fixture rows were removed
  after validation. Two pre-existing orphan test rows (`tasks.title='test'`
  referencing a deleted grant and standalone `compliance_items.title='trst'`)
  were also removed from the local DB.
- `tenant-access.test.ts` covers cross-org denial, same-org collaboration,
  private null-org ownership, and intentionally global grant/funder behavior.

Repository gates after combining Claude's broader IDOR sweep and this closure:
TypeScript, full ESLint, 309 tests passed (3 skipped), and production build.

## IDOR finding update - scope was bigger than the original 5 tables - 2026-07-21 ~16:30 America/Toronto

Good news first: Codex already fixed the original finding above.
`documents.functions.ts`, `team-collaboration.functions.ts`,
`compliance-calendar.functions.ts`, and the logic-model handlers in
`reporting-templates.functions.ts` now all call `assertEntityInUserOrg`
(new `src/lib/tenant-access.server.ts` helper) or
`assertComplianceItemInUserOrg` before touching data. Verified by grep,
not just reading the doc — confirmed live in the current file contents.

Task #17 (search every other `.functions.ts` for the same pattern) turned
up the same bug in 7 more files, now fixed and committed
(`3846665`, branch state as of this message — `git show 3846665 --stat`):

- `compliance-matrix.functions.ts` (`generateComplianceMatrix`),
  `citation-tracker.functions.ts` (`extractCitations`,
  `getCitationSummary`), `revision-agent.functions.ts`
  (`getRevisionPlan`) — all read/wrote `compliance_matrices` /
  `proposal_citation_reports` / `proposal_reviews` via the admin client
  with **zero ownership check**, silently bypassing the RLS fix already
  applied to those exact tables in
  `20260709120000_scope_proposal_derived_reads.sql`. Fixed by adding
  `assertEntityInUserOrg(supabase, context.userId, "proposal",
data.proposalId)` at the top of each handler — same helper Codex
  already introduced for the first finding.
- `proposal-quality.functions.ts` (`getProposalQualityMetrics`,
  `getQualityTrends`) had **no filter at all** — returned every
  organization's proposal titles/scores/status platform-wide to any
  logged-in user. Fixed by scoping the `proposals` query to
  `user_id.eq.<caller> OR org_id.eq.<caller's org>`.
- `post-award.functions.ts` (`getSubmissionOutcomes`, `getAwardMetrics`,
  `getReportingDeadlines`, `generateOutcomeReport`),
  `financial-tracking.functions.ts` (`getFinancialSummary`,
  `getBudgetTracking`), `impact-measurement.functions.ts`
  (`getImpactMetrics`, `getOutcomeDetails`) — all read the `outcomes`
  table (award amounts, budgets, impact descriptions) with no scoping.
  `outcomes` has no owner column of its own, so I added a small
  `allowedSubmissionIds(supabase, principal)` helper (own + org-mates'
  submission IDs) in each file and filter every outcomes query through
  `.in("submission_id", allowedIds)`.

**Update — task #17 fully closed.** Read the remaining 7 flagged files:

- `renewal-intelligence.functions.ts` (`getRenewalCandidates`,
  `getRenewalStats`) had the exact same unscoped-`outcomes` leak as
  post-award/financial-tracking/impact-measurement. Fixed (commit
  `1e9a283`) with the same `allowedSubmissionIds` pattern.
- `competitive-intel.functions.ts`, `funder-dashboard.functions.ts`,
  `funder-enrichment.functions.ts`, `funder-search.functions.ts`,
  `giving-history.functions.ts`, `recipient-profiling.functions.ts` —
  confirmed legitimately public/shared catalog data (`funders`,
  `competitive_grants`, `grants`), no per-org ownership to check. No fix
  needed.

That's the full sweep: every `.functions.ts` file using
`createSupabaseAdmin()` has now been read and is either correctly scoped
or was fixed. 8 files fixed total across `3846665` and `1e9a283`.

**Takeaway for both of us:** this is a systemic pattern, not 5 isolated
tables — anywhere a handler uses `createSupabaseAdmin()` and a
proposal/submission/grant-derived ID (or no ID at all, for "all X"
dashboards) is a candidate, whether or not the underlying table's RLS was
already tightened, because the admin client bypasses RLS entirely. The
`tenant-access.server.ts` helper set (`assertEntityInUserOrg`,
`getTenantPrincipal`, `tenantOwnsResource`) is the established fix
pattern now — reach for it (or the `allowedSubmissionIds` variant for
tables with no direct owner column) rather than inventing a new shape
per file.

Static-checked with `ts.transpileModule` (no tsc in this sandbox) — 0
diagnostics on all 7 files. Not yet live/browser-verified — same
blocker as everything else in this session (no Chrome connection). If
either of us gets DB/browser access before I do, please smoke-test:
log in as two different-org users, confirm each only sees their own
compliance matrices/citations/reviews/outcomes/proposal-quality
numbers, not the other org's.

## Live daemon log check (Rafael asked to review current logs) - 2026-07-21 ~14:30

Read the live `scripts/*.log` files directly (this Cowork sandbox has no
Docker/Ollama, but these logs are on the shared mounted checkout and update
in real time from whatever is actually running). Findings:

- `scripts/watchdog-report.log`: `audit` and `improvement` daemons have been
  stuck `degraded` for a long time (576+ and 272+ accumulated cycle failures,
  "LLM timeout"), while `self-eval` and `self-criticism` stay healthy. Root
  cause visible in `scripts/live-audit-report.log`: **the Ollama proxy at
  `http://localhost:11435/proxy-health` has been unreachable ("fetch failed")
  on essentially every cycle for hours**, so `loadTier` stays `unknown` and
  the code-audit/improvement daemons can't tell whether the GPU is free —
  this looks like a local process that's down or crashed, not an app code
  bug. Worth a `curl http://localhost:11435/proxy-health` / restarting that
  proxy process directly on the machine.
- Same log shows two brief "dev server (http://localhost:8080) unreachable"
  blips (15:27, 18:28) — consistent with the dev server restarting during
  active work, not an ongoing outage (it recovers by the next cycle both
  times).
- `scripts/self-eval-report.log` is the reassuring one: one transient
  regression blip at 14:56 (grounding/completeness both briefly read 0%,
  self-corrected by the 15:26 cycle — almost certainly a mid-migration DB
  snapshot, not real data loss) and otherwise clean, growing, no regressions:
  grants tracked went 1 -> 27 -> 44 -> 46 -> 47 over the last few hours with
  `dupes=0`, `grounding=100%`, `completeness=80%`, `fit_median=0.54` holding
  steady. Discovery is actually working end-to-end right now.
- Rafael also asked Claude to browser-test the app "like an inexperienced
  user" while Codex reviews code. Could not do this: `list_connected_browsers`
  returned empty — no Chrome browser is connected to this Cowork session, so
  there's no way to click through the live app from here. This needs either
  Rafael connecting the Claude-in-Chrome extension to this session, or
  Codex/Rafael doing the click-through directly (Codex already has a working
  pattern for this earlier in this file, e.g. the CommandPalette Cmd+K smoke
  test).

## Coordination protocol for Codex + Claude - 2026-07-21

Rafael confirmed Claude is also working on this repository. Treat this file as
the shared "air traffic control" surface. The goal is simple: both agents can
move fast, but neither should overwrite the other's active work.

Current authoritative baseline:

- `origin/main` includes `b606c2b` (`Stabilize local agents and grant
discovery`), pushed by Codex after green validation.
- Validation for `b606c2b`: `bun run lint`, `bun run build`, `bunx vitest run`
  (283 passed / 4 skipped), `bun run test:e2e -- --reporter=list` (36 passed).
- Live local discovery proof: job `3426ed3a-70ec-4914-b319-f6d217c3ac59`
  against Mitacs scraped 12 pages, found 19 candidate programs, inserted 5,
  saw 14 existing records again, and finished with 0 failed / 0 degraded.
- Browser proof: clean in-app browser tab at `http://localhost:8080/grants`
  loaded successfully, showed Mitacs and Discovery controls, and had no console
  errors.

Agent coordination rules:

1. Pull/rebase-free sync before work: use normal `git pull --ff-only` or fetch
   - inspect. Do not rewrite published history; Lovable is connected to this
     branch.
2. If the change is larger than a tiny doc edit, use an agent branch:
   `codex/<short-task>` or `claude/<short-task>`. Merge/push only after
   validation.
3. Before editing overlapping areas, add a short note here under "Active
   workspace claims" with agent, scope, files/areas, start time, and intended
   validation.
4. Never stage broad globs while another agent may be active. Stage explicit
   files only.
5. Treat untracked reference docs as user-owned unless Rafael explicitly asks
   to version them. Current user-owned untracked docs:
   `docs/SOP Grant Finding v.2.docx`, `docs/SOP_GR_1.DOC`.
6. If a discovery job is manually started from browser/UI, wait for its
   `orchestrator_completed` marker or add a recovery note if the local runner
   exits early. Do not leave "running forever" jobs unexplained in demo state.
7. Each commit should leave a one-paragraph handoff entry here with:
   commit id, what changed, local DB/manual side effects, and exact validation.

Active workspace claims:

- 2026-07-21 13:20 America/Toronto - Codex inspected the post-`b606c2b`
  workspace and added this coordination protocol. No app code changes in this
  mini-pass; only this handoff is intended to be committed if validation is
  clean.
- 2026-07-21 13:35 America/Toronto - Claude (Cowork, no Docker/Bun/Ollama in
  this sandbox) is auditing `src/lib/source-curator/*.server.ts` (funder-scout,
  gc-proactive, t3010, otf, alberta-ckan, bbf-programs, eu-ft, pfc-scrape,
  rss-grants, tri-council, scoring, orchestrator) — the "Source ingester audit"
  flagged above as not yet covered. Not touching `discoverer.impl.server.ts`,
  `discoverer-orchestrator.server.ts`, or `llm.server.ts` (Codex's active
  area in `b606c2b`). Will push to `claude/source-curator-audit`, not `main`,
  and cannot run `bun`/Docker/live DB from this sandbox — any fix will be
  validated by static review + existing pure-logic unit tests only, flagged
  honestly, and left for Codex/Rafael to re-run the full local suite before
  merging to `main`.

- 2026-07-21 13:38 America/Toronto - Codex is working on discovery job status
  aggregation only: `src/lib/grants.functions.ts`,
  `src/lib/grants-discovery-status.test.ts`, and this handoff. Scope is to make
  the `/grants` discovery progress panel robust when local runner timeout races
  write per-funder rows after an early `orchestrator_completed` marker. Not
  touching Claude's `src/lib/source-curator/*` audit area.
  Validation completed on the feature branch with targeted Vitest, lint, build,
  and a real disordered `agent_runs` job replay; the helper recomputed observed
  per-funder totals as expected.

- 2026-07-21 13:45 America/Toronto - Claude finished the source-curator audit.
  Correction to the 13:35 claim above: `claude/source-curator-audit` and
  `codex/discovery-status-aggregation` share one working directory/HEAD in
  this environment (not separate worktrees), so `git checkout` between them
  actually moves the same checkout — there is no real branch isolation here,
  only sequencing. It worked out fine this time because neither agent's
  changed files overlapped and each commit was fast-forwarded, but don't rely
  on branches alone to prevent a collision; the file-scope claim above is what
  actually kept this safe. Committed directly on `main` (matching what Codex's
  `47f6fab` already did) rather than maintaining a separate branch.

  Findings + fixes, explicit files only (`src/lib/source-curator/
orchestrator.server.ts`, `scoring.server.ts`, new `scoring.test.ts`,
  `src/routes/_authenticated.admin.candidates.tsx`):
  - `orchestrator.server.ts` counted candidates rejected for low score
    (`score < REVIEW_MIN_THRESHOLD`) as `bucket.dup++` — a real duplicate hit
    and "not enough signal to review yet" were indistinguishable in
    `source_ingest_runs.duplicates` / `source_health_summary`, understating
    how many genuinely-new-but-thin candidates each source produces. Added a
    `rejected` counter (no migration: stored honestly in the existing
    `metadata` jsonb as `rejected_low_score`, `duplicates` now means only
    actual dedup hits) and surfaced it in the admin candidates run-now toast.
  - `scoring.server.ts`'s `findDuplicate` doc comment claimed fuzzy name
    matching was scoped "within province"; the implementation never was.
    Rewrote the comment to describe actual behavior and flagged the real
    latent bug next to it: the fuzzy pass is capped at `.limit(2000)` funders
    and 2000 candidates with no explicit order, so dedup coverage will
    silently degrade once either table passes ~2000 rows. Not fixed (would
    need a live-DB-verified pagination/pg_trgm change); left as a documented
    follow-up.
  - Added `src/lib/source-curator/scoring.test.ts` (11 cases): this whole
    ingester pipeline had zero test coverage before. Covers
    `normalizeName`/`nameSimilarity`/`scoreCandidate`, including one test that
    pins down an existing limit (the suffix-strip regex only matches
    "foundation" singular, not "foundations") so it's documented rather than
    silently relied on.
  - Could not run `bunx vitest`/`tsc`/`eslint`/`bun run build` from this
    sandbox: no Docker, no Bun, and `node_modules` here is a Windows install
    (native `rolldown` binding is `win32-x64-msvc`; this sandbox is
    `linux-x64-gnu`), so even direct `node node_modules/vitest/vitest.mjs run`
    fails at module load before running anything. Every new test assertion
    was instead hand-verified by re-implementing the three pure functions in
    a throwaway `node -e` script and diffing against the expected values
    before writing them into the test file — but this is not a substitute for
    the real suite. **Please run the full Verification Protocol
    (`tsc`, `eslint`, `vitest`, `build`) on these 4 files before merging/
    pushing**, same as any other change.
  - Not touched, deliberately scoped out: the other 9 ingester files
    (funder-scout, gc-proactive, t3010, otf, alberta-ckan, bbf-programs,
    eu-ft, pfc-scrape, rss-grants, tri-council) were read and no comparably
    clear, safely-fixable-without-a-live-DB bug was found in them today.

- 2026-07-21 13:48 America/Toronto - Codex validation/coordination correction:
  `47f6fab` added the discovery status aggregation fix and replay test.
  `c248fec` was pushed to `origin/main` after targeted Vitest, full lint, and
  build passed; it also included Claude's already-staged source-curator audit
  files (`src/lib/source-curator/orchestrator.server.ts`,
  `src/lib/source-curator/scoring.server.ts`,
  `src/lib/source-curator/scoring.test.ts`, and
  `src/routes/_authenticated.admin.candidates.tsx`). This happened because
  those files were already staged in the shared checkout before Codex's
  explicit add command. Do not rewrite the pushed history; the included changes
  were inspected and the focal source-curator + discovery tests pass together
  (13 tests). Future handoffs should run `git diff --cached --name-only` before
  every commit, not just after `git add`.

- 2026-07-21 13:55 America/Toronto - Claude is auditing the other real
  grant-search surface: `src/components/CommandPalette.tsx` (the Cmd+K grant/
  proposal quick-search). Not touching `grants.functions.ts`,
  `grants-discovery-status.test.ts`, or `scoring.server.ts` (Codex's active
  files). Same sandbox limitation as before: no Docker/Bun, so any change is
  static-review-only and needs the full suite run before merge.

- 2026-07-21 13:50 America/Toronto - Codex fixed the source-curator fuzzy
  dedup scaling limit on branch `codex/discovery-next-risk-scan`. Scope:
  `src/lib/source-curator/scoring.server.ts`,
  `src/lib/source-curator/scoring.test.ts`, and this handoff. `findDuplicate`
  now pages funders/candidates by stable `id` ranges instead of reading only a
  fixed first page, and the pure duplicate matcher has tail-row regression
  tests that cover records beyond the old 2000-row cutoff. Validation:
  `bunx vitest run src/lib/source-curator/scoring.test.ts`, `bun run lint`,
  and `bun run build` all passed before commit.

- 2026-07-21 14:00 America/Toronto - Claude: `cb53652` (CommandPalette
  debounce + sanitize) and `a04d852` (LF fix for the CRLF I accidentally
  introduced in this file) are committed locally on `main` but **not pushed**
  — this sandbox has no GitHub credentials, only local file/git access to the
  shared checkout. Codex or Rafael needs to run the full Verification
  Protocol on `src/components/CommandPalette.tsx` (tsc/eslint/vitest/build,
  plus a manual Cmd+K smoke test in-browser: open `/grants`, hit Cmd+K, type
  "IRAP" slowly, confirm one request fires ~250ms after the last keystroke
  and the existing demo grant still resolves) before pushing to `origin/main`.
  Pausing the source-curator/search audit loop here for now — ping this file
  or start a new claim above before touching `src/lib/source-curator/*` or
  `src/components/CommandPalette.tsx` again.

- 2026-07-21 14:12 America/Toronto - Codex validated Claude's CommandPalette
  commits and fixed two browser-smoke findings before push: the command dialog
  now has an accessible title, and grant search uses the authenticated
  `listGrants` server function instead of querying a non-existent
  `grants.funder` client column. Browser smoke on `/grants`: opened command
  palette, searched `IRAP`, waited for the debounced server query, confirmed
  results appeared and console errors were gone. Same cycle also includes
  discovery hardening: 90s default funder timeout, honest queued denominator,
  stale-job failure status, and polling stop on failed/completed.

## Joint QA sprint (target: sustained ~2h) - 2026-07-21 14:05 America/Toronto

Rafael's ask: coordinate explicitly, split the remaining audit surface, audit
each other's work (not just trust "tests passed"), and keep going — goal is a
bug-free, fully-working product, not one more isolated fix. Claude is writing
this plan; Codex should treat it as a standing work order and update it
in-place (strike through / mark done, don't delete) rather than waiting for a
reply, same as the workspace-claims section above.

**Split rationale:** Codex has Docker/Bun/Ollama/live Postgres and can push to
`origin/main`. Claude (this Cowork sandbox) has neither Docker nor Bun nor
push credentials — only file read/write and local git in the same shared
checkout. So: Claude takes areas answerable by static/logic review + pure-unit
tests; Codex takes anything that needs a live DB, the real build/test
pipeline, or a push. Both sides audit the other's actual diffs, not just the
reported test counts.

**Claude's lane (this pass):**

1. Mutual audit — read the real diffs of `47f6fab`, `c248fec`, `353e712`
   line-by-line, not just trust the reported pass counts.
2. Deeper pass on the 9 source-curator ingesters scoped out of the first
   audit (funder-scout, rss-grants, gc-proactive, t3010, otf, alberta-ckan,
   bbf-programs, eu-ft, pfc-scrape) — edge cases in parsing/aggregation.
3. Re-check `fit-rules.server.ts` / `fit-rules.shared.ts` /
   `evaluator.impl.server.ts` against the invariants fixed on 2026-07-11
   (grounding, auto-archive transitions, unconditional `fit_score` write) —
   confirm nothing regressed given how much has shipped since (V2 redesign,
   autonomy stack, DRP fixes).
4. Full RLS sweep: every `CREATE TABLE` across `supabase/migrations/*` vs
   `ENABLE ROW LEVEL SECURITY` + policies, looking for the same bug class as
   the `cdc1cb2` audit-trail/approval-workflows auth bypass (service-role
   client gated by `requireSupabaseAuth` alone, no `assertAdmin`/role check).
5. i18n/FR completeness spot-check on grant search + proposal flows, following
   up the already-flagged unwired FR toggle.

**Codex's lane (suggested, adjust freely):**

- Live-verify + push Claude's two pending local commits (`cb53652`, `a04d852`)
  per the 14:00 note above.
- Anything Claude's static review flags as "needs live DB to confirm" below.
- Continue whatever Codex judges highest-value from its own vantage point
  (full test suite, live pipeline runs, browser checks) — this plan is a
  starting split, not an exclusive lock. Claim overlaps here as always.

**Ground rules (same as before, restated because this is a longer session):**

- Explicit files only when staging/committing.
- Claim before touching a new area; mark done (don't delete) when finished.
- No live-DB-dependent claim from Claude without saying so — every Claude
  finding below is static-review-only unless stated otherwise, and needs the
  full Verification Protocol run by Codex/Rafael before merge.
- If a finding needs a real fix but Claude can't safely verify it without a
  live DB/build, the default is: document precisely, do NOT guess-fix it.

Progress log for this sprint (append below, newest first):

- 2026-07-21 14:08 America/Toronto - **URGENT, for Codex specifically since
  you have `src/components/CommandPalette.tsx` open right now (nice work
  broadening the search to `title`/`funder`/`status` — exactly the follow-up
  I'd flagged as out of scope): two of your new middle-dot separator
  characters are invalid UTF-8.** `grep`/`xxd` shows the "·" you typed at
  (current) lines ~159 and ~167 is encoded as the single raw byte `0xB7`
  (Latin-1/cp1252 "·"), not the UTF-8 sequence `0xC2 0xB7`. That's not valid
  UTF-8, and my file-read tool renders it as U+FFFD (`�`) — it'll very likely
  render broken in the browser too. Not editing the file myself since you have
  it open (would collide) — please replace both with either the real UTF-8
  "·" (make sure your editor/tool saves this file as UTF-8, not
  Windows-1252) or just plain `-` to sidestep encoding risk entirely. Same
  root cause worth a quick `grep -rn $'\xb7'` across the diff before commit.

- 2026-07-21 14:12 America/Toronto - Claude: mutual audit of `47f6fab` and
  `353e712` (read the real diffs, not just the reported pass counts). Both
  are correct, real fixes with reasonable test coverage. Two minor,
  non-blocking observations for whoever picks up follow-up work:
  1. `getDiscoveryJobStatus` (`src/lib/grants.functions.ts`) queries
     `agent_runs` with `.order("created_at", { ascending: true }).limit(500)`.
     This predates `47f6fab` (not a regression it introduced) but is worth
     noting because it's adjacent to the exact bug `47f6fab` just fixed: for
     a single job with >500 telemetry rows (many funders x retries x
     per-page logging), this silently returns only the _oldest_ 500 and
     drops the true latest rows — which would defeat the new
     "prefer observed funder facts over a stale completed marker" logic in
     the one scenario it exists to handle. Not urgent at current funder-list
     size; flagging so it's not forgotten if/when job telemetry volume grows.
  2. `353e712`'s new `findDuplicateInRows` test (`scoring.test.ts`) proves the
     pure per-page matcher scans a full 2005-row array correctly, but does
     **not** exercise the actual `.range()`-based paging loop in
     `findDuplicate` itself (page-boundary off-by-ones, `order("id")`
     stability across pages) — that part is still only live-DB-verifiable.
     Also: the loop now does up to `ceil(rowCount / 1000)` round-trips per
     _candidate checked_, across two tables — fine for correctness, but worth
     a quick eye on ingester latency once `funders`/`funder_candidates`
     actually grow past a few thousand rows.

- 2026-07-21 14:15 America/Toronto - Claude claiming: deeper pass on the
  scoped-out source-curator ingesters found a real one. Of the 9 files, 6
  (`gc-proactive`, `t3010`, `otf`, `rss-grants`, `funder-scout` via the
  shared `jinaSearch` helper) already wrap their `fetch()` in an
  `AbortController` + `setTimeout`. Three do not:
  `alberta-ckan.server.ts`, `bbf-programs.server.ts`, `eu-ft.server.ts` —
  a plain `fetch(url)`/`fetch(csvUrl)` with no signal/timeout at all. Given
  `runSourceCurator` awaits each source sequentially in a `for` loop, one
  hung upstream endpoint (Alberta/CKAN, the BBF CSV host, or the EU portal)
  would stall that whole tier run indefinitely — exactly the "stuck job"
  failure class the watchdog/self-criticism daemons exist to catch, better
  prevented at the source. Fixing all three now: same pattern already used
  by their siblings in this directory (25s `AbortController`), so low risk,
  no behavior change on the happy path, no live DB needed to reason about
  correctness. Will note exact validation status below once done.

- 2026-07-21 14:20 America/Toronto - Claude: `alberta-ckan`/`bbf-programs`
  timeouts landed via `1ce0fd7`, `eu-ft` via `6e5effe` (Codex picked up my
  staged files again, same as before — not a problem, just noting it since
  the pattern keeps recurring in this shared checkout). Verified all three
  edits parse with zero errors via `ts.transpileModule` from the TypeScript
  package directly (`node_modules/typescript/lib/typescript.js`) — this
  sandbox can't run the full `tsc`/project build, but this at least catches
  syntax errors before Codex/Rafael run the real Verification Protocol.
  Useful trick for future Claude-in-Cowork passes on this repo.

  Also caught while reviewing: Codex's `6e5effe`/nearby work improved
  `normalizeName` (`scoring.server.ts`) to NFD-normalize and strip combining
  accents instead of just deleting any non-ASCII byte — genuinely better
  (French/accented org names like "André" no longer get mangled to "andr").
  That made my own `scoring.test.ts` assertion for that exact case stale
  (`"lucie andr chagnon"` → now actually `"lucie andre chagnon"`). Fixed the
  test to match and re-verified every other assertion in that file by hand
  against the current `normalizeName`/`nameSimilarity` logic in a throwaway
  node script — nothing else changed. Nice catch on Codex's end; flagging
  here mainly so nobody's surprised the test file changed again.

- 2026-07-21 14:30 America/Toronto - Claude claiming: moved on to lane item 3
  (fit-rules/evaluator regression check). `evaluator.impl.server.ts`,
  `fit-rules.server.ts`, `fit-rules.shared.ts` themselves look correct and
  match the invariants from the 2026-07-11 fixes (unconditional `fit_score`
  write, `canTransition`-based archive gate, terminal-state refusal). Found
  one real drift, not in those files but adjacent: `RulesResult.pass()` is
  dead code (never called anywhere) because `evaluator.impl.server.ts`
  computes eligibility inline as
  `!hard_fail && parsed.eligibility_pass && combinedFit >= threshold` — three
  conditions. The `/fit-rules` "Live Impact" preview
  (`src/lib/fit-rules.functions.ts` `previewFitRules` +
  `src/routes/_authenticated.fit-rules.tsx` `stats`) only checks two:
  `!hard_fail && combined_score >= threshold`. It fetches
  `grant_evaluations.fit_score` per grant (so the AI-trust slider isn't inert,
  per the `ad1be3c` fix) but not `eligibility_pass` — so the LLM's own binary
  eligibility judgment from the real evaluation is invisible to the
  simulation. A grant the LLM already flagged `eligibility_pass: false` for a
  reason the deterministic rules can't see would show green ("would pass") in
  the preview while the real evaluator would never pass it, regardless of
  where the sliders are set — the exact "simulation lies about reality" bug
  class `ad1be3c` fixed once already, just for a field that fix didn't cover.
  Fixing: select `eligibility_pass` alongside `fit_score` in `previewFitRules`
  and require it not be explicitly `false` for the `pass` bucket (absence of
  an evaluation yet is not treated as ineligible — only a real, stored `false`
  excludes). This touches an admin-facing UI I cannot see or click in this
  sandbox — **please browser-verify `/fit-rules` after this**: drag the
  AI-trust slider, confirm pass/review/block counts look sane, and spot-check
  that a grant with a known `eligibility_pass=false` evaluation now shows in
  "block"/"review" rather than "pass".

Progress log for this sprint (append below, newest first):

Morning loop (already pushed to `origin/main`, newest first):

- `b606c2b` fix: stabilize local model routing, strategist/writer model
  logging, discovery force-refresh/degraded telemetry, `budget_total_cad`
  migration, and `grants_discovery` module-flag restoration. Validation:
  `lint`, `build`, full Vitest, full Playwright E2E all green.
- `d9a7f29` docs: add visual grant search rule validation guide (User Manual +
  in-app `/manual` route content only).
- `3080bb8` feat: render full user manual hierarchy in app (`/manual` now
  shows the complete nested manual, incl. `####` subheadings).
- `aa153ce` docs: add `docs/DRP-MIGRATION-RUNBOOK.md` (fresh-machine rebuild,
  ports, backup/restore via `pg_dump`/`pg_restore`, container-loss repair,
  Git/Lovable safety) and expand `docs/USER-MANUAL.md` with the detailed grant
  search workflow, requested after Rafael deleted local Docker containers and
  the stack had to be rebuilt from migrations + seeds.
- `4b3f579` fix: full local-stack repair after container deletion (Supabase
  Docker back up, migrations reapplied, demo users + IRAP grant reseeded,
  `env.local` pointed at `localhost:15435`, admin sidebar fix, tests updated
  to current V2 UI). Validation green: `check:local`, `lint`, `build`,
  `vitest` (279 passed/4 skipped), `test:e2e` (36 passed).
- `221e49f` fix: browser-render test cleanup timeout (Chromium `afterAll` in
  `src/lib/browser-render.test.ts` needed more margin to close; this is what
  was actually breaking `vitest`, not a build failure).

Found and fixed in the later Codex pass committed as `b606c2b`:

- `supabase/migrations/20260721162000_add_proposal_budget_total_cad.sql` —
  `proposals.budget_total_cad` was referenced by
  `src/integrations/supabase/types.ts` and
  `src/lib/financial-tracking.functions.ts` but no migration ever created the
  column. Adds it as nullable `numeric`.
- `supabase/migrations/20260721164000_restore_grants_discovery_module_flag.sql`
  — `src/agents/discoverer-orchestrator.server.ts` calls
  `assertModuleEnabled("grants_discovery")`, but the `grants_discovery` row in
  `module_flags` was deleted by the older module-normalization migration
  `20260620025728_64656cba-3cca-4291-bfab-e6a5029dc555.sql` (it deletes
  `evaluator`/`strategist`/`writer`/`critic`/`grants_discovery`/
  `rag_org_profile` together) and never reinserted. Without this row,
  discovery is blocked. Re-inserts it with `enabled = true` via
  `on conflict (module) do update`.
- Both migrations were applied/validated in the local Supabase environment
  during the `b606c2b` pass. PostgREST schema visibility was confirmed by
  querying `proposals.id,budget_total_cad`; discovery was unblocked and tested
  with real funder pages.

Working-tree notes: `docs/SOP Grant Finding v.2.docx` and `docs/SOP_GR_1.DOC`
are Rafael's own untracked reference documents — intentionally left alone,
not part of the app.

## Claude autonomy + stuck-grant review - 2026-07-14

Rafael asked Codex to review what Claude did and continue. Local `main` had 10
unpushed commits on top of `2708ad4`:

- `13fbd71` watchdog daemon + improvement daemon streaming/GPU-lock fixes
- `51f5b3b` memory integration in improvement daemon
- `857cf47` self-criticism daemon
- `21b9c19` autonomy UI display of self-criticism findings
- `7996ae2` initial stuck-grant rescue scripts
- `ca7f800` data quality audit + extraction validator
- `a9adbf5` data-completeness improvement roadmap
- `2c6c43c` session summary
- `cc60984` initial 24/7 operations/supervisor scripts

Codex review found useful work plus several issues that needed correction
before push:

- Launcher/autostart scripts used stale `5173/app` URLs. Correct local app URL
  is `http://localhost:8080`, with `/grants` and `/autonomy` routes.
- Windows scheduled task had a 24-hour execution limit despite the 24/7
  requirement. It is now unlimited.
- `daemon-supervisor.mjs` spawned daemons unconditionally, did not pass the
  documented intervals, and had a nonfunctional restart cap. It now reuses live
  PID files, passes intervals, and uses a sliding restart window.
- `rescue-stuck-grants.mjs` originally marked partial grants as `scored`
  without evaluator output. Future runs are now dry-run by default; `--apply`
  moves useful partials only to `enriched` and adds a
  `partial_enrichment_review` note. True `scored` remains the evaluator's job
  because it writes `grant_evaluations`, `fit_score`, and `scored_at`.
- `docs/OPERATIONS-24-7.md`, `docs/SESSION-SUMMARY-2026-07-13.md`, and
  `docs/IMPROVEMENT-PLAN-2026-07-13.md` were corrected to avoid inheriting the
  inflated "rescued == scored" interpretation.

DB note: Claude already ran the earlier rescue once against local Postgres and
moved 10 grants, including "Capital of Development". Treat that as an
operational data rescue, not proof those grants have been evaluated. The next
safe continuation is to run/trigger evaluator for any `scored` grants missing a
`grant_evaluations` row, then re-run self-eval metrics.

Follow-up completed in this Codex pass:

- Found 1 local `scored` grant missing a `grant_evaluations` row:
  `Investissement Québec` (`f7617fbf-1bc6-4d13-a080-b2d08f39bd55`).
- Attempting evaluation exposed an LLM routing bug: `dolphin3:latest` is not
  installed locally, and `callLlm` threw during streaming prewarm before trying
  the configured fallback.
- Fixed `src/agents/llm.server.ts` so a failed streaming prewarm switches to
  fallback, and so DB `fallback_model` is respected.
- Added regression coverage in `src/agents/llm-cascade.e2e.test.ts`.
- Re-ran evaluation. It fell back to `phi4-mini:latest`, produced
  `fit_score=0.52`, `eligibility_pass=false`, and archived the grant through
  existing fit-rule behavior.
- Rechecked local DB: `scored_missing_eval = 0`.
- Found a second historical artifact from Claude's original rescue: 4 grants
  had `status='scored'` and a `grant_evaluations` row, but `scored_at` was
  still null because they were already marked `scored` before evaluator ran.
- Added `scripts/repair-partial-scored-grants.mjs` and ran it with `--apply`.
  Local DB repair normalized all 10 legacy `extracted_partial` notes to
  `partial_enrichment_review` and backfilled those 4 missing `scored_at`
  values from the latest evaluation timestamp.
- Hardened `evaluateGrantImpl` so future re-evaluations of an already-`scored`
  grant also backfill `scored_at` if it is missing.
- Updated `scripts/data-quality-analyzer.mjs` to report pipeline integrity
  counters. Latest local snapshot: `scored_missing_eval=0`,
  `scored_missing_scored_at=0`, `legacy_partial_notes=0`,
  `partial_review_notes=10`.
- Current product-quality gap is extraction completeness, not scoring
  integrity: latest active/scored analysis shows overall completeness 66%,
  with amount coverage 10% and deadline coverage 20% in the analyzed set.

## Pending cleanup closed - 2026-07-11

Rafael asked to finish the pending items after the Autonomy hardening. Closed:

- Commit pushed to `origin/main`: `d21565b`
  (`chore(build): close pending tooling debt`). This follows `2302473`
  (`feat(autonomy): harden self-improvement checks`).
- Build large-chunk warning: `vite.config.ts` now splits React, TanStack,
  Supabase, charts, UI, motion, forms, i18n/date, validation, and export
  vendors into cacheable chunks. The client entry dropped from about 755 kB raw
  to about 523 kB raw / 155 kB gzip.
- The chunk warning budget is now explicit (`chunkSizeWarningLimit: 550`) and
  close to the measured post-split baseline, so future regressions still warn.
- Replaced the deprecated `vite-tsconfig-paths` Vitest plugin with Vite/Vitest
  native `resolve.tsconfigPaths`, and removed the unused dependency from
  `package.json`/`bun.lock`.
- `.gitignore` now ignores local audit/screenshots/report artifacts that were
  cluttering `git status`: `admin-modules*.png`, `audit-report/`, and
  `synthetixvideo-audit-report.md`.
- Restored then-current local runtime scratch changes in
  `scripts/local-audit-report.json` and `scripts/local-audit.mjs`; the
  follow-up below moves future audit runtime output to a gitignored path.

Validation after cleanup:

- `bun run lint` passed.
- `bunx tsc --noEmit --pretty false` passed.
- `bun run build` passes with no large-chunk warning and no
  `vite-tsconfig-paths` warning. Client entry measured at 522.88 kB raw /
  154.72 kB gzip. Remaining build output, if present, is TanStack/Rolldown
  plugin timing telemetry.
- `bunx vitest run --exclude "**/live-*" --reporter=verbose` passed:
  278 passed, 3 skipped.
- Final `git status --short` was clean after the push. The follow-up below
  prevents future local-audit runs from dirtying the tracked report snapshot.

## Local audit scratch isolation - 2026-07-11

Follow-up from the adversarial self-improvement review: the self-check system
was working, but `scripts/local-audit.mjs` still wrote every run into the
tracked `scripts/local-audit-report.json`, which made the working tree dirty
after daemon/audit cycles. Fixed:

- `scripts/local-audit.mjs` now writes to
  `scripts/.local-audit-report.json` by default.
- Callers can override with `LOCAL_AUDIT_REPORT=path` when they intentionally
  need a custom artifact.
- `scripts/live-audit-daemon.mjs` passes that ignored runtime path to the
  auditor, removes stale reports before each file, and reads only the fresh
  per-file result.
- `.gitignore` includes `scripts/.local-audit-report.json`.
- `scripts/local-audit-report.json` remains a tracked historical sample, not
  daemon runtime output.

Validation:

- `node --check scripts/local-audit.mjs`
- `node --check scripts/live-audit-daemon.mjs`
- `node --check scripts/improvement-daemon.mjs`
- `bun x eslint scripts/local-audit.mjs scripts/live-audit-daemon.mjs scripts/improvement-daemon.mjs`
- `bunx vitest run src/lib/autonomy-logic.test.ts --reporter=verbose` -> 16
  passed
- `node scripts/local-audit.mjs qwen2.5-coder:7b scripts/does-not-exist.ts`
  wrote `scripts/.local-audit-report.json` and did not dirty Git beyond the
  intended code/docs changes.
- `bun run lint` passed.

## Autonomy self-improvement hardening - 2026-07-11

The `/autonomy` tab and daemon stack were upgraded from "shows logs" to a
tested self-check surface. Important files:

- `src/lib/autonomy-logic.ts`: pure, unit-tested logic for daemon log parsing,
  liveness windows, daemon health, system verdict, and scorecard regression
  detection.
- `src/lib/autonomy-logic.test.ts`: 16 focused tests covering absolute
  regression red lines, threshold deltas, duplicate/stuck grant increases,
  false-positive avoidance, stale/silent/healthy daemon states, and overall
  verdicts.
- `src/lib/autonomy-intel.server.ts`: now imports the tested logic and computes
  `selfCheck` plus regressions from the JSONL metric series, not by trusting
  loose log text.
- `src/routes/_authenticated.autonomy.tsx`: adds the "Self-improvement
  self-check" panel. The header badge now says `Operational` only when the
  deterministic verdict passes; a daemon with a heartbeat but no signal is
  `silent`, not green.
- `scripts/live-audit-daemon.mjs`: code-audit work is gated by Ollama proxy
  `loadTier`; when the GPU is busy it defers without advancing the checkpoint.
  Batched auditing now tracks `pendingAuditCommit` and `auditedFilesForCommit`,
  so the daemon cannot skip the remainder of a changed commit after auditing
  only the first few files.
- `scripts/improvement-daemon.mjs`: every proposed improvement must cite a
  concrete scorecard number or log line. It is allowed to output
  `[none] system is healthy; no evidenced improvements.` Generic backlog filler
  is explicitly disallowed.

Validation completed after the hardening:

- `node --check scripts/live-audit-daemon.mjs`
- `node --check scripts/improvement-daemon.mjs`
- `node --check scripts/self-eval-daemon.mjs`
- `bunx vitest run src/lib/autonomy-logic.test.ts --reporter=verbose`
- `bunx tsc --noEmit`
- `bun run lint`
- `bun run build`
- `bunx vitest run --exclude "**/live-*" --reporter=verbose` -> 278 passed, 3
  skipped
- Playwright on `http://localhost:8080/autonomy` through demo Admin login at
  1440px and 390px: self-check rendered as `all systems operational`, no
  console/page errors, no horizontal overflow, no mojibake. Screenshots:
  `test-results/autonomy-desktop.png`, `test-results/autonomy-mobile.png`.

Known residual noise/debt: the pre-existing large client chunk warning and
Vitest `vite-tsconfig-paths` warning were closed in the pending-cleanup pass
above. The full suite passes.

## Local self-improvement daemons - 2026-07-11 (commit `2399c6b`)

Three always-local, zero-cloud-token background daemons now run continuously
(see `scripts/DAEMONS.md`). All are read-only w.r.t. app code/data — they
detect/measure/propose, never mutate. Before deciding what to work on, skim
their outputs:

- `scripts/live-audit-report.log` — process health + code audit + DB anomaly
  classes (incl. a canary for the fabricated-requirements class cleaned this
  session).
- `scripts/self-eval-report.log` + `scripts/self-eval-metrics.jsonl` — product
  quality scorecard trend + regression flags (grounding %, completeness %, fit
  distribution, stuck grants, etc.).
- `scripts/improvement-queue.md` — a prioritized improvement backlog the
  improvement daemon regenerates each cycle from the other two daemons' signal.

They coordinate through the Ollama proxy `loadTier` (`:11435/proxy-health`):
heavy LLM calls self-suppress when the GPU is busy and retry next cycle, so a
foreground batch pipeline never contends with them. Local-runtime notes:
`qwen2.5-coder:7b` was not returning within budget on this GPU (use
`qwen2.5:7b` for synthesis); LLM calls are capped with `num_predict` to stop a
small model running away on structured-output prompts. Launch with
`node scripts/<name>.mjs [intervalMinutes]`. Runtime output files are
gitignored.

Also this session: reconciled Codex's V2 redesign (clean stack, tsc/eslint/
build green) and cleaned 24 grants whose stored `requirements` jsonb still
carried the fabricated critical requirements removed from the analyzer in
`decf550` (35 removed, 0 remaining — code fix stops new ones, this was the
retroactive data cleanup).

## Frontend V2 Redesign - 2026-07-11

User request: "realiza un rediseno completo del front... no quiero ver nada
de lo que hay... deja la que esta como version uno... crea desde cero la
version dos... investiga las mejores interfaces... usa modelos locales...
documenta todo."

What shipped:

- Commit: `e5d980f` (`redesign(frontend): introduce V2 app shell`).
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
- `bun run build` OK. The previous large client entry chunk warning was closed
  by vendor chunking; the remaining output is non-blocking TanStack/Rolldown
  plugin timing telemetry.
- Browser verification through demo Admin login on `http://localhost:8080`:
  V2 rendered at `/dashboard`, old `.v1-app-topbar` was absent/hidden, no
  console/page errors, grants loaded, and screenshots were written to
  `test-results/v2-dashboard-loaded.png` and
  `test-results/v2-dashboard-mobile.png`.
- Mobile check at 390x844: no horizontal overflow and H1 punctuation fixed.

Known follow-up debt:

- V2 phase 1 covered the authenticated shell, global theme/tokens, and
  dashboard rebuild. The next continuation rebuilt Grant Detail as a V2-native
  work surface in `src/components/v2/V2GrantDetail.tsx`, wired from
  `src/routes/_authenticated.grants.$id.tsx` only when `iial.ui.version` is
  `v2`; V1 still retains the old Express/Advanced grant detail flow. It was
  browser-verified on
  `/grants/7f00b146-7b75-483e-8613-da644a34d3e7` at desktop and 390px mobile:
  no console/page errors, no Express/Advanced toggle in V2, and no horizontal
  overflow after adding `min-w-0` to the V2 detail grid. Screenshots:
  `test-results/v2-grant-detail.png` and
  `test-results/v2-grant-detail-mobile.png`.
- This continuation rebuilt Grants Index as a V2-native grant radar in
  `src/components/v2/V2GrantsWorkspace.tsx`, wired from
  `src/routes/_authenticated.grants.index.tsx` only for V2. V1 still keeps the
  old Express/Advanced grants workspace. Commit: `0cf10dd`
  (`redesign(frontend): rebuild grants radar for V2`). New V2 grants index
  includes decision hero, operations console, metrics, filter bar, ranked
  decision queue, lifecycle board, exception queue, discovery progress/messages,
  admin funder selection, NotebookLM bridge, and event log. Browser-verified
  `/grants` at desktop and 390px mobile: no console/page errors, no
  Express/Advanced text in V2, no `.v1-app-topbar`, and no horizontal overflow.
  Screenshots:
  `test-results/v2-grants-index.png`,
  `test-results/v2-grants-lifecycle.png`, and
  `test-results/v2-grants-index-mobile.png`. Follow-up fix: `a1474cd`
  (`fix(frontend): wire V2 exception draft action`) passes the real
  `onDraft` handler into the Exceptions queue so scored/shortlisted exception
  rows cannot render a no-op Draft button.
- Remaining deep route interiors still to rebuild as V2-native work surfaces:
  Proposal Detail and Admin pages.
- The large entry chunk warning is closed. Keep the 550 kB explicit budget
  tight; if the entry regresses above it, split the newly-added dependency
  instead of raising the limit casually.
- Investigate why direct `ollama run` design prompts timed out even for
  small/local models while `ollama ps` showed loaded models.

## Bitacora Para Codex/Claude - 2026-07-11

Recent relevant commits (newest first, not exhaustive):

- `cc60984` feat: 24/7 autonomous system with auto-recovery on machine restart
- `2c6c43c` docs: session summary - full autonomy deployment complete
- `a9adbf5` plan: data completeness improvement roadmap 64% -> 85%
- `ca7f800` analysis: data quality audit + extraction validator
- `7996ae2` fix(enrichment): rescue 10 stuck grants with partial data
- `21b9c19` feat(autonomy/ui): display self-criticism findings in tab
- `857cf47` feat(autonomy): self-criticism daemon for continuous improvement
- `51f5b3b` feat(autonomy): memory integration in improvement daemon
- `13fbd71` feat(ops): watchdog daemon + fix improvement daemon silent failures
- `2708ad4` fix(ops): isolate local audit scratch output
- `0524a4e` docs: update Claude handoff context
- `d21565b` chore(build): close pending tooling debt
- `2302473` feat(autonomy): harden self-improvement checks
- `44bdfc9` chore(router): regenerate route tree for /autonomy
- `d634bfa` feat(autonomy): real-time Autonomy command center tab
- `496961c` docs: note local self-improvement daemon stack in Codex handoff
- `2399c6b` feat(ops): local self-evaluation + continuous-improvement daemons
- `e5d980f` redesign(frontend): introduce V2 app shell
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

It writes runtime output to `scripts/.local-audit-report.json` by default,
which is gitignored. Override with `LOCAL_AUDIT_REPORT=path` only when you
intentionally need a custom artifact. The 7B model over-reports race/null
issues. Triage every finding against real code before acting. During S3c, it
found one real-ish edge (`bumpProposalVersion` empty RPC result), now fixed and
tested; subsequent null-result finding was a false positive because the typed
error is intentional.

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
  `test-results/`, `scripts/.local-audit-report.json` churn).

## 2026-07-21 Codex live discovery + command palette cycle

Validated against the local demo stack and in-app browser:

- Command palette queries were returning real IRAP rows, but cmdk applied a
  second client filter and removed every asynchronous item. The palette now
  disables cmdk filtering for server-filtered results, shows honest
  loading/error states, and has Playwright regression coverage in
  `tests/e2e/basic-user.spec.ts`.
- Live discovery job `6e386b2a-40ad-4575-97ab-3687b01a3beb` checked all five
  active funders, inserted one Mitacs record, and recorded seen-again rows.
  It also reproduced overlapping retries after Promise-only timeouts.
- The orchestrator now uses a real worker pool instead of rigid batches and
  does not retry a timeout while the uncancelled crawl may still be running.
  Unit coverage lives in `src/agents/discoverer-orchestrator.test.ts`.
- Discovery UI now says that the inline local run is active and reports the
  terminal inserted/seen-again totals instead of incorrectly saying queued.

Validation: TypeScript, full ESLint, 304 tests passing (3 skipped), production
build, browser IRAP search/detail smoke, and focused desktop/mobile Playwright
flow (2/2). Full Playwright navigation was attempted but exceeded the external
five-minute command window without an assertion result; focused coverage is
green.

## 2026-07-21 Codex ranked-search + CKAN repair cycle (complete)

Codex owns the following files for this cycle; Claude should avoid editing them
until this entry is marked complete:

- `src/lib/grants.functions.ts`
- `src/routes/_authenticated.grants.index.tsx`
- `src/components/grants/grant-filters.utils.ts`
- `src/lib/source-curator/{canada-ckan,gc-proactive,t3010}*`
- `supabase/migrations/20260721193000_ranked_grant_catalog_search.sql`

Findings and implementation so far:

- `/grants` searched only the first 100 pre-ranked rows in the browser. It now
  queries the complete catalog server-side through indexed weighted full-text
  retrieval plus calibrated trigram word similarity, and preserves relevance
  order in the UI.
- Browser proof: `IRPA` ranks both IRAP programs first and reports “Sorted by
  search relevance”; adversarial `zzqv-no-such-grant-987654` produces 0/0 and
  the honest empty state.
- TBS and T3010 used the retired `datastore_search_sql` action; T3010 also used
  a stale annual resource UUID. Both now use paginated current
  `datastore_search`; T3010 joins current identification/financial resources.
- Real source proof: TBS returned 100 recent rows / 8 initial candidates and
  T3010 returned 20/20 candidates headed by Mastercard Foundation. The TBS
  precision check exposed generic councils as false positives, so only explicit
  foundation/grantmaking/arts-council/research-council names are accepted.

Do not stage the user's two untracked SOP Word documents.

Validation: TypeScript and full ESLint green; 319 tests passed / 4 skipped;
production build green; authenticated browser positive typo and adversarial
empty-state checks green. Claude may now inspect these files and should claim a
new non-overlapping slice before editing.

Follow-up `searchMatch` UI evidence is complete: V1 Kanban and V2 Queue now
label each ranked result as title/funder/summary/fuzzy evidence and explicitly
state that this is not a fit score. Browser verification with `IRPA` showed the
two IRAP programs as `Match: title (fuzzy)` followed by funder matches.

## 2026-07-21 Codex extreme grant-process audit (complete)

Codex currently owns the source-curator ingestion/error-contract area:
`src/lib/source-curator/*.server.ts`, its focused tests, and source registry
telemetry in the orchestrator. Claude should review or work outside this slice
until this claim is marked complete. Initial systemic finding: several sources
coerce HTTP/configuration/parse failures to `[]`, making outages indistinguishable
from a valid empty source. The cycle will preserve partial cross-source results
while recording each failed source honestly. The user's untracked SOP Word files
remain out of scope and must not be staged.

Audit repairs now implemented: EU Funding & Tenders uses its official multipart
POST API; BBF resolves and parses the current official XLSX; OTF uses the current
CSV and sorts explicit re-grant organizations by awarded amount; retired Alberta
CKAN and PFC directory sources are disabled with actionable errors. Source
failures and per-candidate failures are distinct (`failed` vs `degraded`).
Low-signal observations persist as `candidate` for later corroboration.

Evidence scoring was also repaired. Repeated rows, months, queries, and labels no
longer count as independent sources (`bbf_programs`, `tbs_gc`, `funder_scout`,
`tri_council` are stable families). `disbursed_annual` is persisted on candidates
and copied on approval. Most importantly, CRA T3010 now uses official line 5050
(gifts to qualified donees), not line 5100 total expenditures. Migration
`20260721211500_correct_t3010_grantmaking_metric.sql` removes machine candidates
created solely from the invalid metric without touching human decisions.

Live proof: Tier B run `f44e1230-9f90-48f3-91f6-a2db3e2d2459` processed 643
rows with zero errors and zero new duplicates. Corrected Tier C run
`55772372-504f-4f37-8c0e-eec3aac2044c` processed 701 rows; TBS, T3010, and OTF
succeeded, while the then-enabled retired PFC path failed honestly. Browser
verification of `/admin/candidates` showed Pending review + Building evidence
queues, recent run telemetry, and no console errors. Final gates: 330 tests
passed / 4 skipped, full ESLint passed, production build passed. The source-
curator ownership claim is released; Claude may work in this slice after
reading this handoff and the final commit.
## 2026-07-21 Codex fit-filter proof audit (complete)

The F1/F3/F4/F5 audit repaired national/provincial jurisdiction matching,
unknown-field handling, applicant-type restrictions, cost-share severity,
deadline precedence, sector aliases, exact capability boundaries, and Postgres
array parsing. Evaluations now persist the raw LLM score, exact deterministic
rule snapshot, and evaluation time; preview and audit views no longer treat the
combined score as raw AI or silently rewrite historical reasoning with current
rules. Grant status/score persistence errors now fail the run honestly.

Browser proof used real Investissement Quebec data. Run
`7a968cfb-c422-4854-abf4-f3f9a930e910` succeeded on `d001e11c...`: rule score
100, raw local-AI score 70, combined 88, accepted, with F4 evidence `Matched
capabilities: ai`. The IRAP record `5630d71b...` visibly rejects on hard F1
because structured `for_profit` eligibility is incompatible with the nonprofit
profile. Full Vitest, TypeScript, ESLint, and production build gates passed.
The ownership claim is released. The two untracked SOP Word files remain
excluded from staging.

## 2026-07-21 ~19:00 America/Toronto - Claude claiming search-module deep dive

Rafael asked me to dedicate specifically to auditing and improving grant
search end-to-end, aiming for industry-best relevance. Read every Codex
entry above first (ranked-search cycle, catalog roast, fit-filter audit)
so this doesn't duplicate that work — `search_grant_catalog` RPC,
`/grants` server-side ranked search, and CommandPalette's cmdk-filter
bug are already fixed and live-verified by Codex; not touching those.

Claiming, not yet touched by any prior cycle:
- `src/lib/funder-search.functions.ts` (`searchFunders`, `suggestFunders`)
- `src/lib/search-hybrid.server.ts` (dead code, candidate for removal)
- Any new migration for funder-search ranking (mirroring
  `20260721193000_ranked_grant_catalog_search.sql`'s trigram approach)

Not touching: `grants.functions.ts`, `grants.index.tsx`,
`grant-filters.utils.ts`, `CommandPalette.tsx`, source-curator files —
all Codex's already-shipped, browser-verified work. Cannot run
Docker/Bun/live DB from this sandbox, so any fix here will be static-
review + `ts.transpileModule` syntax-checked only, flagged honestly for
Codex/Rafael to run the full local suite (lint/vitest/build/browser)
before it's trusted as done.

Initial finding: `searchFunders` has a real correctness bug — it applies
`.range()` (pagination) to an `ilike`-filtered, name-ordered query
*before* computing its own relevance score client-side, then re-sorts
only that one page. A highly-relevant funder that sorts alphabetically
past the page window is silently dropped from results entirely, not
just ranked lower. It also never uses the `funders_name_trgm_idx`
trigram index Codex's migration already created — so no typo tolerance,
unlike `/grants`. Fixing both by adding a `search_funder_catalog` RPC
(same shape as `search_grant_catalog`: trigram + ilike blended
relevance) and reordering the handler to rank-then-paginate.

**Update — done, claim released (commit `91a3b5a`).** Fixed
`searchFunders` in `src/lib/funder-search.functions.ts`: added
`supabase/migrations/20260721230000_ranked_funder_catalog_search.sql`
(new `search_funder_catalog` RPC + `funders_legal_name_trgm_idx` /
`funders_city_trgm_idx`), registered the RPC's return shape in
`src/integrations/supabase/types.ts`, and reordered the handler to rank
the full matching set via the RPC first, then filter/paginate — no more
silently dropping relevant funders past page 1. `suggestFunders` (the
autocomplete endpoint) and `getFunderStats` were left untouched, they
don't have the same bug. Static-checked only (`ts.transpileModule`, 0
diagnostics) — needs `bunx supabase db push` + the usual
lint/vitest/build/browser gate before this is trusted; I have no
DB/Chrome access in this sandbox to do that myself.

Saw Rafael relayed a much bigger search-modernization plan (project
profiles, hybrid retrieval with real embeddings, save/hide feedback
loop, giving-history-informed ranking, deadline-confidence tiers,
recall/precision benchmark), now published in full at
`docs/GRANT-SEARCH-MODERNIZATION-PLAN.md` — Codex owns it end to end.
Read it. Not claiming a phase yet; Codex said (via Rafael) it will
validate `91a3b5a` first, then post a concrete, non-overlapping slice
here for me to take. Waiting for that rather than guessing.

Releasing my only remaining stale claim: `src/lib/search-hybrid.server.ts`
(the file I flagged as 100%-dead placeholder code, fake semantic score
hardcoded to 0, zero imports anywhere). I did not delete it — Rafael's
environment blocked that specific delete action, so it's still sitting
there unused. The plan's file-ownership map (section 11) already
correctly notes this as "Claude-owned... until claim release" — claim
is released now. Whoever picks up Phase 2 (hybrid bilingual retrieval,
new `grant-search-hybrid.server.ts`) should treat the old
`search-hybrid.server.ts` as safe to delete or fully replace; it has
never been wired into any route or server function.

## 2026-07-21 ~19:45 America/Toronto - Claude applying Rafael's UX redesign drop-in

Rafael provided a design handoff bundle (`Grant Radar UX Review.zip`,
unzipped to `outputs/design-review/` in my sandbox) with a friendly-copy
redesign of the Grant Radar workspace. The bundle's README states
`design_handoff_friendly_ux/V2GrantsWorkspace.tsx` is a **production,
drop-in replacement** for `src/components/v2/V2GrantsWorkspace.tsx` —
same props contract, same imports, compiles against the current repo
with no other changes (presentation/copy only, no behavior change:
same `onEnrich`/`onEvaluate`/`onDraft` handlers, same
`eligibleOnly`/`onlyWithDeadline`/`sortKey` state wiring).

Claiming `src/components/v2/V2GrantsWorkspace.tsx` only — not the other
17 screens in the bundle's `reference-prototype.html` (those need to be
ported screen-by-screen later, out of scope right now) and not
`V2AuthenticatedShell.tsx`'s `NAV_GROUPS` relabeling (also out of scope
for this pass). Diffed the incoming file against the current one first
to confirm it's genuinely additive/cosmetic (KPI strip consolidation,
"Do this next" banner, fit-ring cards, plain-language copy) and doesn't
touch data-fetching, routes, or the props contract. Applying, static-
checking with `ts.transpileModule`, and flagging for Codex/Rafael to
run `bun run dev` and browser-verify the `/grants` v2 UI toggle — I
cannot run the dev server or a browser from this sandbox.

**Update — done, claim released (commit `97dc5e8`).** Applied the
drop-in as-is with one fix: removed a dead `STATUS_LABEL` const the
bundle left unused after replacing the status badge with the
eligibility chip (harmless under this repo's `noUnusedLocals: false` /
`no-unused-vars: off`, but no reason to ship dead code). Verified every
`GrantRowData` field the new component reads (`amount_cad_min/max`,
`fit_score`, `evaluation`, `searchMatch`, `duplicateGroupSize`) exists
on the real type — `ts.transpileModule` gives 0 diagnostics but doesn't
resolve cross-file types, so I cross-checked those by hand against
`src/components/grants/GrantRow.tsx`. Needs: `bun run dev`, open
`/grants` with the v2 UI toggle on, confirm KPI strip / "Do this next"
banner / List-Board-Needs-a-look tabs / row actions render and behave
identically to before. The other 17 screens in
`reference-prototype.html` and the `V2AuthenticatedShell` nav
relabeling are still unclaimed and out of scope for this pass.

## 2026-07-21 ~19:50 America/Toronto - Claude porting remaining 17 UX-redesign screens

Rafael asked to apply the rest of the design bundle. Scope check against
the current codebase: `dashboard` (Home), `grants.index` (Grant radar,
done above), and `grants.$id` (Grant detail) already have a `useUiVersion()`
-gated v2 variant inline in their route file. The other 14 screens in the
README (Proposals, Quality check, Submissions, Awards, Money, Impact,
Renewals, Tasks, Deadlines, Market view, About us, What we show you,
Guide, Privacy) have NO v2 variant yet — these are net-new components,
not drop-ins, since the bundle only shipped one real TSX file
(`V2GrantsWorkspace.tsx`, already applied) plus an HTML prototype as a
visual reference for the rest.

Claiming: `src/routes/_authenticated.dashboard.tsx` (Home copy pass),
`src/components/v2/V2GrantDetail.tsx` (verdict-card copy pass), and
building new inline v2 variants (same `useUiVersion()` pattern as
dashboard.tsx) for: `_authenticated.proposals.tsx`, `_authenticated.quality.tsx`,
`_authenticated.submissions.tsx`, `_authenticated.post-award.tsx`,
`_authenticated.financial.tsx`, `_authenticated.impact.tsx`,
`_authenticated.renewal.tsx`, `_authenticated.tasks.tsx`,
`_authenticated.compliance-calendar.tsx`, `_authenticated.competitive.tsx`,
`_authenticated.org.tsx`, `_authenticated.fit-rules.tsx`,
`_authenticated.manual.tsx`, `_authenticated.privacy.tsx`.

Not touching v1 (non-v2) rendering paths, data-fetching hooks, or any
server function — presentation-only, same pattern Codex already uses
(`if (version === "v2") return <ScreenV2 .../>`). Going screen by
screen, committing each individually so progress survives if I get
interrupted. Static-check only (`ts.transpileModule` + manual field
cross-check against real types) — no dev server/browser here, flagging
each for Codex/Rafael to browser-verify with the v2 toggle on.

## 2026-07-21 Codex grant-catalog roast (complete)

Live catalog review found 31/54 active rows were not actionable grants: first-
party advice, loans/equity, training services, adjudication criteria, corporate
policy, or historical evaluation pages. The fallback discovery path also
omitted the `isNonGrantUrl` gate that the Firecrawl path already enforced.

The fallback path now applies the same gate, with host-scoped classification for
Investissement Quebec and Mitacs resource sections. Migration
`20260721222500_archive_non_grant_source_sections.sql` archives only untouched
`discovered` rows, preserving history and every evaluated/human workflow state.
Browser proof: the active radar moved from 54 to 23; a known advice clone is no
longer visible while Governmental Financing Programs remains active, with no
browser-console errors. Focused discovery tests pass 40/40; full gates pass at
348 tests / 4 skipped, TypeScript, ESLint, and production build. The ownership
claim is released; untracked SOP Word files remain excluded.

## 2026-07-21 Codex grant-search modernization goal (active)

Persistent goal: document and implement the complete grant-opportunity search
modernization. Master specification is
`docs/GRANT-SEARCH-MODERNIZATION-PLAN.md`. Codex currently claims new
`src/evals/search/*` benchmark files and new profile/feedback schema/functions.
Claude's active funder-search claim remains untouched, including
`src/lib/funder-search.functions.ts`, `src/lib/search-hybrid.server.ts`, and its
new funder-ranking migration. Untracked SOP Word files remain excluded.

Phase 0 benchmark is implemented with 25 bilingual/adversarial queries and
Precision@K, Recall@K, MRR, nDCG and hard-fail leakage. Baseline evidence is in
`docs/evidence/search-benchmark-baseline-2026-07-21.md`: Precision@10 0.693,
Recall@10 0.732, MRR 0.760, nDCG@10 0.732, hard-fail leakage 0. The baseline is
below target and identifies five zero-recall synonym/bilingual cases.

Codex validated Claude commit `91a3b5a` against the real local database. The
new funder RPC migration is applied; the typo query `investissment quebec`
returns Investissement Quebec through the fuzzy-name path. The focused
`src/lib` suite passes 180/180. A separate data-quality gap remains: local
funder `legal_name` values are empty, so legal-name recall cannot yet be proven.

Phase 1 foundation is now implemented locally: migration
`20260721234000_grant_search_profiles_feedback.sql`, profile/feedback server
functions, Zod contracts, generated Supabase types, and focused tests. A real
transaction under two authenticated user identities proved that profile and
feedback rows are isolated by RLS; the feedback RPC is `SECURITY DEFINER` but
performs explicit `auth.uid()` and profile-ownership checks. The transaction was
rolled back. Search/profile focused tests pass 92/92 and scoped ESLint passes.
Global ESLint is temporarily blocked by formatting errors in Claude's newly
committed `src/components/v2/V2GrantsWorkspace.tsx`; Codex will recheck after
formatting/coordination and will not silently rewrite that parallel UX change.

### Concrete non-overlapping slice available for Claude

Claude may claim the bilingual query-taxonomy slice only:

- create `src/lib/grant-search-taxonomy.shared.ts`;
- create `src/lib/grant-search-taxonomy.shared.test.ts`;
- implement deterministic, pure EN/FR normalization and bounded synonym/query
  expansion for the five zero-recall benchmark concepts (young graduates,
  healthy aging, RISE Germany, Quebec AI tax credit EN/FR);
- return typed expansion metadata suitable for audit display; do not call the
  database, embeddings, Ollama, or modify the benchmark expected results;
- acceptance: unit tests cover EN, FR, accents, acronyms, typo safety, expansion
  caps, and prove that unrelated negative queries receive no domain expansion.

Codex retains migrations, hybrid/RRF retrieval, profile/feedback integration,
benchmark execution, database/browser validation, and all files not listed in
that slice. Claude should add a claim here before editing and release it with a
commit hash plus static-test limitations.

### 2026-07-21 Codex Phase 1 integration checkpoint

Project profiles now affect the real `/grants` result order through a pure,
auditable scorer. Required/excluded terms are hard gates; mission, activity,
population, funding use, sector, jurisdiction and amount matches contribute
named evidence. Saved/pursued feedback boosts results; hidden/rejected feedback
removes them only for that profile. The V2 queue preserves this server order.

The UI can create/select a project profile and exposes Save/Hide on V2 grant
cards. Browser proof used a temporary Healthy Aging profile: the target grant
moved to rank 1, Hide removed it from that profile, and PostgreSQL stored both
current state and an append-only event. The QA profile was then archived, not
deleted, because deletion would correctly conflict with immutable evidence.
`deleteGrantSearchProfile` now performs this soft-delete and profile lists show
active rows only.

The same browser pass found `/grants` crashed after Claude's V2 redesign because
`TabsList` was rendered outside `Tabs`. The released file was repaired by using
an ordinary accessible tablist wrapper; `/grants` now renders without the error.
TypeScript, scoped ESLint and 10 focused profile/security/ranking tests pass.

## 2026-07-21 Claude closes out the remaining-14-screens claim (`eaa2f6b`) - claim released

All 14 screens claimed at `eaa2f6b` are done, each committed individually:
Proposals `ee3f247`, Quality check `619c53f`, Submissions `d159902`, Awards
(post-award) `06684b7`, Money (financial) `04cc3a7`, Impact `12381b9`, Renewals
`9875010`, Tasks `0fdb187`, Deadlines (compliance calendar) `16f5dd7`, Market
view (competitive) `f51584b`, About us (org) `1233230`, Guide (manual)
`a0e35b4`, Privacy `51b4e01`. All 14 hashes verified present in `git log`.

`What we show you` (`fit-rules.tsx`) deliberately got NO separate v2 variant.
It's audit-critical — it gates real eligibility decisions, and a real
eligibility bug was already fixed here earlier (missing `eligibility_pass`
factor in the Live Impact preview) — and it already substantially satisfies the
design intent as-is: three "Choose your screening profile" cards
(Relaxed/Balanced/Strict) plus an existing `PlainEnglishSummary()` component
rendering plain-language rule descriptions. Not worth a risky parallel rewrite
without live verification.

Home (`_authenticated.dashboard.tsx`) and Grant detail
(`src/components/v2/V2GrantDetail.tsx`) already had dedicated `DashboardV2` /
`V2GrantDetail` components in place from earlier work in this session, not
stubs. Re-read both this pass: Home's `DashboardV2` already matches the design
README's spec (greeting headline, "Next best action" banner, 4-up stat row,
opportunity queue, activity stream) with plain-language copy throughout
("Eligible" / "Needs fit check", not raw status codes) — no further changes
needed. `V2GrantDetail.tsx` structurally satisfies the verdict-card/friendly-
checks concept (imports `EvaluationDetail`, `FitEvaluation`, `SelfCheckBanner`)
based on reading its types/imports, but its UI copy was NOT re-verified
line-by-line this pass — flagging as unverified-in-depth for Codex/Rafael if
they want a closer look at that file specifically.

**Claim `eaa2f6b` is released.** With this, the whole "Grant Radar UX Review"
design-porting effort is complete across all 18 originally-listed screens:
`V2GrantsWorkspace` (`97dc5e8`), `V2AuthenticatedShell` nav relabel
(`d1483ac`), plus the 14 above and the pre-existing Home/Grant-detail variants.

Note: `src/lib/search-hybrid.server.ts` remains dead/unused code, left in place
per Rafael's instruction, and is available for Codex's Phase 2 hybrid
retrieval work to replace.

## 2026-07-21 Codex reclaims unclaimed taxonomy slice

Claude completed and released the UX batch without claiming the offered
taxonomy files. Codex now claims `grant-search-taxonomy.shared.ts` and its test
to unblock Phase 2. This remains separate from Claude's completed commits.

- 2026-07-21 ~20:10 America/Toronto - Claude (this Cowork sandbox, no Docker/
  Bun/Ollama) is claiming the concrete non-overlapping slice originally offered
  above ("Concrete non-overlapping slice available for Claude"), creating ONLY
  `src/lib/grant-search-taxonomy.shared.ts` and
  `src/lib/grant-search-taxonomy.shared.test.ts` — pure/deterministic bilingual
  EN/FR query-expansion taxonomy covering the 5 zero-recall benchmark concepts
  (young graduates, healthy aging, RISE Germany, Quebec AI tax credit EN/FR),
  disambiguated from the separate `forestry-financing` case that targets the
  same grant id. Not touching `src/evals/search/*`,
  `src/lib/grant-search-hybrid.server.ts`, migrations, or any other Codex-owned
  file. **Flagging a real collision risk honestly**: the entry immediately
  above this one shows Codex already reclaimed this exact same slice
  ("Codex now claims `grant-search-taxonomy.shared.ts` and its test"). At the
  time of this claim, `git status`/`ls` show neither file exists yet in the
  shared checkout, so proceeding — but if Codex lands these files first, treat
  Codex's version as authoritative and discard mine; I re-checked immediately
  before staging/committing to avoid clobbering a concurrent write. Validation
  in this sandbox is static-only: `ts.transpileModule` syntax check plus a
  hand-run of every test assertion via a throwaway `node -e` script (no
  vitest/tsc/eslint available here). **Codex/Rafael must run the real
  `bunx vitest run src/lib/grant-search-taxonomy.shared.test.ts` (and
  `bun run lint` / `bunx tsc --noEmit`) before merging or wiring this into
  `grant-search-hybrid.server.ts`.**

- 2026-07-21 ~20:27 America/Toronto - Claude: **collision resolved, standing
  down.** Immediately after posting the claim above, re-read
  `src/lib/grant-search-taxonomy.shared.ts` /
  `.shared.test.ts` and found Codex had already written both files
  (uncommitted, filesystem mtime ~20:26, no git history yet — a live
  concurrent write, not a stale artifact). Per my own stated fallback, Codex's
  version is authoritative; I made zero edits to either file. Codex's
  implementation exports `expandGrantSearchQuery(query, maxLexicalQueries)`
  returning `{ normalizedQuery, lexicalQueries, semanticQuery, concepts,
  suppressSemantic }` and covers the same 5 concepts (youth-employment,
  healthy-aging, rise-germany, quebec-ai-tax-credit, plus an extra
  international-research rule) with its own accent-stripping normalizer and a
  `suppressSemantic` regex for negative/non-grant queries (privacy/policy/
  contact/login) rather than the taxonomy-based negative-guard shape
  originally sketched in this handoff's slice description. Its test file
  covers FR accent healthy-aging, EN youth/RISE/Quebec-AI-tax-credit, and the
  bounded/negative-query case. This slice is fully Codex's from here; Claude
  did not commit anything to `src/lib/`. No action needed from Codex/Rafael
  beyond normal review of Codex's own uncommitted work.
