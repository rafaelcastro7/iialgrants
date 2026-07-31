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

### Cerebras model names FIXED (live 404 → working)

Live LLM logs showed the hybrid cloud chain is **cloud-first** (per Rafael:
"usa los cerebros como fuente inicial") and Cerebras→Groq fallback works — but
Cerebras was always 404ing: the code used `llama3.1-8b` / `llama-3.3-70b`, which
this account does not have. `GET /v1/models` shows the account only exposes
`gemma-4-31b`, `gpt-oss-120b`, `zai-glm-4.7`. Tested JSON output of each:
`gemma-4-31b` returns clean `{"score":0.8,"pass":true}`; `gpt-oss-120b` truncates
(harmony reasoning tokens → "Unexpected end of JSON input"); `zai-glm-4.7`
returns empty content. Fixed `CEREBRAS_MODEL_MAP` to use `gemma-4-31b` for all
agents (heavier reasoning falls through to Groq `llama-3.3-70b` next in chain).
Before the fix the evaluator failed `schema_validation: Unexpected end of JSON
input`; after it, evaluation succeeds.

### Action / lifecycle stages verified

| Stage / action | Result |
| --- | --- |
| `/grants` search "IRAP" | ✅ 17→8 relevant |
| `/fit-rules` Simulate impact | ✅ 3 pass / 13 review / 4 block |
| Enricher (Check fit on discovered grant) | ✅ ran via cloud; grounding gate honestly refused `enrichment_insufficient` (source lacks amount/deadline) — correct behavior |
| Evaluator (Re-evaluate fit, enriched grant) | ✅ Cerebras `gemma-4-31b` ok=true 438ms → `fit_score 0.96`, `eligibility_pass true` |
| Hybrid cloud chain fallback | ✅ live: Cerebras→Groq observed in logs |
| Writer (Draft "Problem Statement") | ✅ Cerebras `gemma-4-31b` ok=true 849ms → 1207 chars written |
| Critic (Run critic) | ✅ after fix below → succeeded, score 62%, 8 findings, renders in Advanced view |

### Schema-validation-aware LLM fallback ADDED + critic prompt FIXED

The critic's schema is more complex than the evaluator's (`overall_score`,
`summary_en`, `findings[]` with strict `severity` enum). Cerebras `gemma-4-31b`
returned syntactically valid JSON that didn't match the Zod schema (missing
`overall_score`), and the critic only ever called one provider — no retry on a
schema mismatch, unlike the retry-on-HTTP-error path. Root cause found by
testing every provider: **all** of them (Cerebras, Groq 70b, Gemini, local
dolphin3/dolphin-mistral) failed to produce `severity` as one of
`critical|major|minor|suggestion` — the prompt described the rules in prose but
never stated the exact JSON shape, so models invented values like
`"major|critical"` or omitted `overall_score` entirely. Two fixes:

1. **`llm.server.ts` / `llm-cloud.server.ts`**: added an optional `validate`
   guard to the LLM call chain — if a provider's output parses as JSON but
   fails the caller's schema, the chain now advances to the next provider
   (Cerebras→Groq→Gemini→Ollama) instead of stopping at "the LLM responded ok".
   Applies to both the cloud chain and the local Ollama path.
2. **`schemas.ts`**: rewrote the critic prompt to spell out the exact JSON
   shape and the literal enum values expected for `severity`.

After both fixes, "Run critic" on proposal `3c57dedf` succeeded end-to-end
(model `dolphin3:latest`, 3081ms, score 0.62, 8 findings) and rendered
correctly in the Advanced view — before the fix this action failed 100% of the
time.

### Second bug found: Citation Tracker read the wrong source entirely

"Extract Citations" always reported 0 citations for every proposal, no matter
how well-grounded. Cause: `citation-tracker.functions.ts` regexed section
*prose* for academic `(Author, 2024)`-style inline citations — a format this
app never produces. The writer already grounds every claim to a retrieved
evidence chunk and records it in `proposal_citations` (`marker` = `[dN]`,
`chunk_id`, `snippet`) as it drafts — visible right in the same page as each
section's "Citations" list. Fixed `extractCitations` to read that table
instead of re-parsing content with the wrong pattern. Verified: proposal
`3c57dedf` now reports 7 total citations / 7 verified / per-section counts
matching the real `[d1]`-`[d4]` markers, where it previously always showed 0.

### Third (unfixed, flagged) bug: Compliance Matrix checks contradict its own policy badges

`generateComplianceMatrix`'s `checks` list matches each requirement by taking
only its *first word* and doing a bare substring `.includes()` with no word
boundaries — so "EDI considerations addressed" reduces to "edi", which matches
inside ordinary words like "immediate" and reports "met" even when the
proposal never discusses EDI. This directly contradicts the same function's
separate `policyAlignment` object (proper keyword list: "equity"/"diversity"/
"inclusion"), which correctly shows ✗ for EDI on the same proposal — both are
rendered side by side in the UI, visibly disagreeing. Flagged as a background
task rather than fixed inline (cosmetic/confusing, not blocking).

### Fourth stage verified: Expert Review Panel

"Run Expert Review" (6-reviewer LLM panel, `multi-expert-review.functions.ts`)
previously failed 100% of the time via every provider (9min timeout locally)
with the same `"major|critical"` enum bug as the critic — same schema shape,
same root cause. After the critic prompt/schema fix (which this endpoint
shares), it now succeeds in 3.7s: overall score 1.3/10 for proposal
`3c57dedf` (7/9 sections empty), with grounded, non-fabricated per-reviewer
findings (e.g. Budget Analyst: 0/10, "Budget section is entirely empty";
Domain Expert: 2/10, cites the specific missing methodology). Confirms the
fallback fix generalizes correctly beyond the single critic action.

### Exports verified (all fired real server calls, 200 OK)

Export Markdown / DOCX / PDF all triggered `exportProposalFile` with the
correct `format` param and returned 200.

### Fifth stage verified: Submit (with blocking gate + force path)

Clicking Submit on proposal `3c57dedf` (22% ready, critic 62%, well below the
submit threshold) correctly triggered the `submit_blocked` gate and rendered a
"Submit Anyway" escalation instead of silently allowing or silently refusing.
Force-submitting recorded a real `submissions` row (method `portal`,
confirmation `TEST-LOOP-001`, real timestamp), flipped `proposals.status` to
`submitted`, and the Submissions list page immediately showed the new "Sent"
entry with today's date and the Sent counter incrementing 1→2. No fabrication,
no silent bypass — the low-readiness warning worked exactly as designed.

### Sixth stage: "Find new grants" discovery — two real issues found, unfixed

Every discovery run I could find in `agent_runs` history (00:07, 04:26, and
10:32 UTC — spanning 10+ hours) inserted **0 new grants**, across all 5 active
funders, every time:

1. **Jina Search API key is expired/invalid** — every single search-seed
   query (`jina_search_401`) fails, in every run, for every funder. Confirmed
   by curling `s.jina.ai` directly with the key from `.env`: it returns 401 on
   its own, independent of the app. This isn't a code bug — the code degrades
   gracefully (sitemap-based crawling still runs), but the extra "search the
   web for this funder's grant pages" channel has been silently dead for at
   least the last 10+ hours. **Needs a new key from jina.ai** (external
   credential, not something to fix in code) if full discovery is wanted.
2. **Timeout regression on 3/5 funders** — NRC IRAP, Investissement Québec,
   and Mitacs all succeeded earlier today (04:26-04:30 run: found 9/10/17
   grants respectively) via sitemap-based crawling, but the 10:32 run timed
   out on all three at the fixed 90s `funder_run_timeout_90000ms` ceiling with
   zero grants found. Same funders, same code, different outcome a few hours
   apart — likely load/timing sensitive (Ollama contention from the
   session's other LLM-heavy tests, or slower page fetches) rather than a
   pure regression, but worth a dedicated investigation with fresh
   measurements. The other 2 funders (Trade Commissioner Service, Innovation
   Canada) have failed with 404/fetch-failed on their index page in every run
   observed — likely a stale source URL needing an update.

Net effect right now: "Find new grants" runs, shows honest partial-failure
telemetry (no fabricated success), but has not actually added a new grant to
the catalog in any observed run today.

### Seventh stage verified: Funder enrich

"Enrich" on the Funders page (`funder-enrichment.functions.ts`) is fully
deterministic — no LLM, no `agent_runs` row — it fetches the funder's website
HTML directly and regexes out `<meta description>`/`og:description`, social
media handles, and keyword-matched focus areas, storing the result in
`funders.charitable_programs`. Clicked Enrich on NRC IRAP: real data landed —
`mission_statement: "National Research Council of Canada: Home"`,
`social_media: {twitter: nrc_cnrc, linkedin: 8417?trk=tyah, instagram:
nrc_cnrc}`, and a plausible focus-area keyword list, `updated_at` fresh.
Minor cosmetic imperfection (not worth a separate task): the LinkedIn regex
captures raw numeric company IDs with trailing query params
(`8417?trk=tyah`) rather than a clean handle when the org uses a numeric
LinkedIn URL instead of a named slug — cosmetic only, the data is still real
and present.

### Eighth issue found (unfixed, flagged, HIGH severity): app-wide click-freeze after a Dialog closes via mutation `onSuccess`

On `/tasks`, creating a task via the "New task" dialog works and shows a
"Task created" toast — but immediately afterward, **every click anywhere on
the page silently does nothing** (confirmed: clicking "Start task" produced
no network request at all, and the task's `status` stayed `pending` in the
DB). Root-caused with a direct DOM inspection: `document.body.style.pointerEvents`
was stuck at `"none"`, and the Radix Dialog's overlay + content `<div>`s were
still present in the DOM — full-viewport (`0,0` to `1280,720`), `z-index: 50`,
`pointer-events: auto` — despite both showing `data-state="closed"`. A hard
reload clears it (`pointerEvents` back to `"auto"`), and confirms the click
handler itself is fine: on a fresh load, clicking "Start task" correctly
fires `updateTaskStatus` and flips the row to `in_progress`. So the bug is
specifically in the **dialog-close path**, not the button.

The Create Task dialog closes via `setDialogOpen(false)` called inside the
`createMutation`'s `onSuccess`, alongside `toast.success(...)` and
`queryClient.invalidateQueries(...)` in the same callback
(`_authenticated.tasks.tsx`) — a state update fired from an async
mutation callback rather than a direct user gesture (Escape/overlay-click),
which is a known trigger for Radix Dialog body-lock cleanup races. The same
"dialog + close-on-mutation-success" pattern is used in at least 14 files
across the app (`grep` for `setDialogOpen(false)`/`setOpen(false)` next to a
mutation `onSuccess`), so this is very likely reproducible well beyond
`/tasks` — any "Create X" dialog that closes itself from a mutation success
handler is a candidate. Flagged as a background task rather than patched
blindly here, since Radix animation/cleanup races need careful diagnosis
(exact repro conditions, whether it's tied to the toast library coexisting
with the dialog, whether a targeted fix or a app-wide safety net is right) —
not a 5-minute fix.

## All pipeline stages + buttons now exercised

Every stage of the grant lifecycle (discover → enrich → evaluate → draft →
review → submit) and every button on the proposal Advanced view, the grants
page, and the funders page has been clicked and verified against real local
data this session. Three real bugs were found and fixed (schema drift,
Cerebras model names, critic/expert-review schema validation + citation
tracker wrong-format bug); two more were found and flagged as background
tasks with full repro details rather than fixed inline (compliance matrix
substring false-positives, discoverer timeout regression + stale funder
URLs + expired Jina key).

## 2026-07-30 session — security audit, human e2e walkthrough, git history purge

### Security/logic audit (2-agent parallel review, every finding empirically re-verified before fixing)

Six real, confirmed bugs found and fixed — not just flagged:

1. **IDOR in `multi-expert-review.functions.ts`** — `scoreProposal` and
   `getProposalReviews` never checked the calling user's org against the
   target proposal's org. Fixed by calling
   `assertEntityInUserOrg(supabase, context.userId, "proposal", data.proposalId)`
   in both handlers.
2. **SSRF in `funder-enrichment.functions.ts`** — `scrapeFunderWebsite` was
   called with a user/DB-supplied URL with no scheme/host allowlist check.
   Fixed by gating the call behind the existing (but previously unused here)
   `isSafeExternalUrl()` from `external-preview.shared.ts`.
3. **Multi-tenancy was completely non-functional** — `profiles.org_id` was
   never assigned anywhere in the app, so the `can_access_tenant_entity()` RLS
   policy and every `assertEntityInUserOrg()` check silently passed for
   everyone (org_id null == null). Fixed by having `saveOrgProfile`
   (`org.functions.ts`) create/upsert an `organizations` row and backfill
   `profiles.org_id` on first save, and propagating `org_id` through proposal
   creation (`strategist.functions.ts`) and submission creation
   (`submissions.functions.ts`).
4. **Unchecked upsert error in `admin-users.functions.ts`** —
   `inviteAdminUser`'s admin-role grant could fail silently (RLS, transient
   DB error) while the audit log still recorded `as_admin: true`. Fixed by
   checking the upsert's `error` and throwing.
5. **3 unchecked updates in `approval-workflows.functions.ts`** —
   `approveStep`'s reject/final-approve/advance-step branches didn't check
   the `approval_instances` update's error, so a failed transition looked
   identical to a successful one. Fixed by capturing and throwing on error
   in all three branches.
6. **Stale cache after workflow approval** —
   `_authenticated.admin.workflows.tsx` only invalidated the
   `["approval-workflows"]` query on approve, not `["approval-steps"]`, so
   the step list could show stale state after an action that visibly
   succeeded. Fixed by invalidating both.

Also fixed: `autoEvaluatePending` in `grants.functions.ts` conflated *any*
`assertAgentEnabled` failure with "evaluator disabled" instead of checking
for the `agent_disabled:` prefix specifically; a mislabeled button on
`/proposals` (`Plus` icon + "New application" text on what is actually the
knowledge-base resync action) was relabeled to `RefreshCw` + "Sync knowledge
base"; a `chromium.launch()` call in `browser-render.server.ts` had no
timeout and could hang a request indefinitely — wrapped in a 15s
`Promise.race`; and a `pointer-events: none` stuck-body bug (Radix dialog
cleanup race — see the `/tasks` writeup above) got a defensive
`usePointerEventsUnstickSafety()` MutationObserver safety net in
`__root.tsx` rather than a per-dialog fix, since the pattern repeats in 14+
files.

Flagged but deliberately **not** fixed (out of scope / needs a design call,
not a bug fix): 6-component fit-score tier threshold inconsistency, a dead
`multi-tenant.functions.ts` module, and an unused duplicate scoring engine
(`scoring-multi-axis.server.ts`).

### Full human-walkthrough e2e test

`tests/e2e/full-lifecycle.spec.ts` now exercises the entire real lifecycle in
one serial Playwright test — sign in → save org profile → sync knowledge base
→ search a real grant → enrich → evaluate fit → draft every proposal section
→ run the critic → export Markdown → attempt submit (asserting it correctly
hits the readiness gate, not a silent success) — and passes reliably against
the live local Supabase stack and real cloud LLM calls. This caught the
`Plus`-icon button bug above (a human clicking through the app would have
been confused by "New application" resyncing an existing knowledge base
instead of creating anything) and confirmed the "one primary action at a
time" pattern in `ProposalDetailExpress.tsx` behaves correctly through a full
12-section draft loop.

### Grant discovery pipeline — verified against real, live behavior (not just code-reading)

Asked to be "acidic and critical" and verify empirically rather than trust a
code-reading explanation. Confirmed live:

- **Firecrawl path is disabled** (`USE_FIRECRAWL=0`, empty
  `FIRECRAWL_API_KEY` in `.env`) — the fallback path (Path B in
  `discoverer.impl.server.ts`) is what actually runs for every funder today.
- **Jina Search seeding is broken** — live call returns HTTP 401. The key in
  `.env` is present but invalid/expired. **Needs the user to get a fresh key
  from jina.ai** — not something fixable from code.
- Despite both of the above, the **fallback path genuinely works**: index-page
  link scoring + sitemap.xml seeding + per-page LLM extraction, deduped via
  `crawl_ledger`'s `canonical_key` (sha256), correctly wired to the real
  `funders` table (not a mock/self-built table that looked plausible but was
  disconnected). Live test against NRC IRAP: 1 new grant inserted, 5 correctly
  deduped as already-seen. Typical runtime ~137s/funder — well inside the
  180s `LOCAL_TIMEOUT_MS` discoverer timeout floor.
- Self-correction during this investigation: a discoverer test appeared to
  "hang" past a 120s test timeout while an Ollama fallback call was in
  flight. Initially misreported this as "Ollama fallback has no timeout" —
  wrong. `llm-timeouts.server.ts` does give the discoverer a real 180s
  timeout (`LOCAL_TIMEOUT_MS`); the test's own timeout was just shorter than
  that. Re-run with a 280s test timeout, the real call completed in 97.7s.
  Lesson generalized into the project skill (see `SKILL.md`): verify the
  actual configured timeout before concluding something hangs forever.

### Git: leaked secret purge, then a bigger discovery — GitHub already had a month of work the local copy never had

`.env` (real `GROQ_API_KEY`) was present in 5 historical commits, tracked
before `.gitignore` was corrected. GitHub's push protection (GH013) rejected
the push. Purged via `git filter-branch --index-filter` across `main` + all 5
`claude/*` branches, then `refs/original/*` backup refs deleted, then
`git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
Verified clean: `git log --all --diff-filter=A -- .env` returns nothing, and
`git count-objects -v` shows 0 loose/garbage objects.

**Before pushing the cleaned history, `git push origin main` was rejected as
non-fast-forward — investigated rather than force-pushed blindly.**
`git fetch origin main` revealed GitHub's `main` already had 867 commits that
never existed in this local copy (recovered from the network share's git
clone): a full month of real work (2026-06-19 → 2026-07-21) — the V2 "friendly
redesign" UX pass across nearly every screen, bilingual hybrid search,
RLS/auth security fixes, and a cloud-LLM migration with its own independent
secret cleanup, apparently done directly against GitHub (commit messages
reference "Codex"). The two histories share a common ancestor at 2026-06-19
and diverged from there — the local E: copy is not a superset of GitHub's
`main`, and force-pushing would have destroyed that month of work.

**Resolution**: pushed the cleaned local history to a new branch,
`local-work-2026-07-30`, plus all 5 `claude/*` branches under their own
names — `origin/main` was left untouched. **Reconciling the two histories
(which likely both touch the same files independently) is an unresolved,
manual decision for the user** — not something to auto-merge blindly given a
month of parallel changes on both sides.

**Follow-up**: opened
[PR #1](https://github.com/rafaelcastro7/iialgrants/pull/1) from
`local-work-2026-07-30` into `main` so the reconciliation goes through
GitHub's normal review UI instead of a silent local merge. Confirmed via
`gh pr view`: 529 changed files, +288,446/-331 lines, `mergeStateStatus:
DIRTY`, `mergeable: CONFLICTING` — GitHub itself cannot auto-merge this, which
matches the "a month of independent architecture on both sides" assessment
above. Recommendation left on the PR: instead of resolving that conflict
wholesale, re-apply just this session's 6 security fixes (listed above) by
hand on top of current `main`, since `main` has an entire month of UX/schema
work this local checkout never saw, and the security fixes are small,
self-contained, and already fully documented here.

### Misleading comment found while explaining the discovery/search pipeline to the user

Asked (again) to "recorre el sistema y con total honestidad" explain how grant
search works — this surfaced a real inaccuracy rather than a functional bug.
`discoverer-orchestrator.server.ts`'s post-discovery auto-evaluate step built
what its own comment called "a user-scoped client (RLS as the triggering
user)" — but it constructed that client with `SUPABASE_SERVICE_ROLE_KEY`, the
admin key, which bypasses RLS entirely. It was, in fact, a second, redundant
instance of the same admin client already in scope as `supabaseAdmin`.

Impact was low — `evaluateGrantImpl` (the only thing this client is passed
to) filters every read/write with an explicit `.eq("user_id", userId)`
rather than depending on RLS for isolation, and `userId` here is always the
same `triggeringUserId` that kicked off the job — so no cross-user data
exposure was possible in practice. But the comment was actively wrong, which
is worse than no comment: it would mislead the next person into assuming a
real RLS boundary exists here, and into copying the same pattern somewhere
that lacks the explicit `user_id` filter safety net. Fixed by removing the
fake client construction (reuse `supabaseAdmin` directly) and replacing the
comment with the actual reasoning: no user JWT is available in this
background-job context, so the admin client is used deliberately, and safety
comes from `evaluateGrantImpl`'s explicit `user_id` filters, not from RLS.

### Reconciliation, take two: port fixes onto main instead of merging histories

Asked to "analiza lo que sirve, reconstruye y unifica el git" — actually do
the reconciliation PR #1 only proposed. Cloned GitHub's `main` fresh into
`E:\dev\iial-grants-github-main` (a fully separate repo, no shared objects
with the local checkout) and audited it directly, file by file, against
every fix listed above, instead of assuming the local diagnosis still
applied:

- **Every one of the 6 original security/logic bugs, plus the false-RLS-
  comment fix, was confirmed to independently exist in `main` too** —
  `main`'s own "Secured auth & RLS on tables" / "Fixed RLS security issues"
  commits addressed different issues. Notably, `main` already has
  `tenant-access.server.ts` wired into 12+ files — the infrastructure existed,
  it just was never called from `multi-expert-review.functions.ts`.
- **`src/lib/multi-tenant.functions.ts` is not dead in `main`** the way it
  looked in the local checkout — it's part of a live, extensively-used
  tenant-isolation system there. The local copy's version of this subsystem
  had fallen behind, not main's.
- Comparing `src/` wholesale (`diff -rq`) found local and `main` share
  essentially the same file tree — 348 of 366 local files exist at the same
  path in `main`, and **344 of those 348 shared files differ in content**.
  Both sides independently rewrote nearly the entire codebase since the
  2026-06-19 fork point, not just the areas each side's commit messages
  advertise.
- Given that, an early plan to wholesale-replace `main`'s
  `discoverer.impl.server.ts` / `discoverer-orchestrator.server.ts` with
  local's (more evolved on filters/ledger logic) was **reverted after
  discovering `main`'s `src/lib/source-curator/` has 10+ funder-source
  ingesters (Alberta/Canada CKAN, EU, GC Proactive, RSS, Tri-Council, T3010)
  that don't exist locally at all** — swapping the core discoverer files
  risked silently breaking real capability `main` has that local never built,
  for a net-uncertain gain. Scoped down to exactly one confirmed, narrow fix
  in that file (the false-RLS comment) and left the rest of the discovery
  subsystem alone on both sides — flagged as needing dedicated reconciliation
  effort, not a blind copy.
- The remaining 9 fixes were re-applied **directly against `main`'s actual
  current code** (not patched from a diff — each was re-read and re-written
  by hand against what `main` has today), plus the one net-new local-only
  file the SSRF fix depends on (`external-preview.shared.ts`).
- Verified before pushing: `tsc --noEmit` clean, and the full Vitest suite —
  **378 tests passing across 52 files, 0 failures** (2 skipped, expected —
  they need live external services) — including `discoverer-orchestrator.test.ts`,
  which still passes after editing that file.
- Result: 10 atomic commits (one per fix) on branch `unify-2026-07-30`,
  opened as [PR #2](https://github.com/rafaelcastro7/iialgrants/pull/2) —
  **14 files changed, +188/-22, `mergeStateStatus: CLEAN`, `mergeable:
  MERGEABLE`** (confirmed via `gh pr view`), a direct contrast to PR #1's
  529 files / +288k / `CONFLICTING`. PR #1 was commented with a pointer to
  #2 and left open as a historical record of the full divergence, not closed.

This is deliberately a narrower result than "unify everything": the
discovery/source-curator subsystem — where both sides have real,
independent, unreconciled work — is explicitly **not** part of PR #2 and
remains open work.

### Funders module audit — the funder-candidate pipeline had never run

Asked to review the funders module end to end and confirm everything is
"integrated and wired." It's more built than it looked from the outside:
11 source-curator ingesters (Grants.gov API, RSS bundle, BBF, EU Funding &
Tenders, Tri-Council, regional development, CRA T3010, OTF, Alberta CKAN,
PFC, LLM-driven funder-scout), with dedup + scoring + auto-promote logic and
a full admin console at `/admin/sources` + `/admin/candidates`, properly
linked from `AdminSidebar`.

But checked against the live local DB, not just the code:
- `funder_candidates` and `source_ingest_runs` both had **0 rows** — this
  pipeline had never executed once, despite being fully built.
- `cron.job` (the real table, not migration files) has jobs for the
  discoverer, enricher, deadlines, decay, archive, and RSS-poll — **none**
  for `source-tier-a`, `source-tier-b`, or `source-curator`, even though all
  three webhook routes exist and work.
- Root cause for why it was invisible on `/admin/sources` even for manual
  runs: the ingester that actually executes under the key
  `rss_grants_bundle` had **no row** in `discovery_sources_registry` — the
  registry only had two vestigial rows (`grants_gov`, `idrc_rss`) pointing at
  feeds the real code no longer polls under those keys. Fixed via migration
  `20260730180000_register_rss_grants_bundle_source.sql`, applied to both
  this checkout and (independently confirmed to have the identical bug)
  ported into [PR #2](https://github.com/rafaelcastro7/iialgrants/pull/2).

Then actually wired it end to end rather than stopping at the registry fix:
- Added `20260730190000_schedule_source_curator_cron_jobs.sql` — daily Tier A,
  weekly Tier B + scout, monthly Tier C, matching the tiering already
  documented in `orchestrator.server.ts`'s own header comment.
- Getting this to work locally surfaced a real, separate gap: pg_net
  (running inside the Docker Postgres container) couldn't reach the Vite dev
  server running natively on Windows at all. Two things were blocking it —
  Windows Firewall's default inbound block (opened with a narrow rule for
  TCP 8080 only) and Vite's own `allowedHosts` DNS-rebinding protection
  rejecting the `host.docker.internal` Host header (added to
  `vite.config.ts`). Local DB settings (`app.hook_base_url`,
  `app.hook_apikey`) point the cron jobs at the local dev server instead of
  their production fallback — set directly via `ALTER DATABASE`, not
  committed, since these are environment secrets/config, not migration
  content.
- Verified by firing the exact command pg_cron will run for Tier B: all of
  `bbf_programs`, `eu_ft_portal`, `tri_council`, `regional_development`
  succeeded; `funder_scout` failed on the already-known expired Jina key
  without taking down the run. **643 new funder_candidates** now sit in
  review (22 `pending_review`, 621 low-score `candidate`) across the Tier A
  + Tier B runs — up from 0.
- Noted, not acted on: almost all of Tier A's new candidates are US federal
  agencies (Grants.gov is a US API) — correctly held at low score rather
  than auto-approved, but worth a product decision on whether that's desired
  for a Canada-focused app.

### Jina Search eliminated (dead), Jina Reader fixed (was never actually dead)

Asked directly "jina funciona? sino eliminalo y crea un sistema local igual y
mejor" — verified both Jina endpoints live rather than assuming from the
earlier 401s seen mid-session:
- **Jina Search** (`s.jina.ai`): 401 `AuthenticationRequiredError` even with
  **no** API key sent — its free/anonymous tier has been removed entirely,
  not just "our key expired." No fix short of a paid key was possible, so it
  was eliminated as asked.
- **Jina Reader** (`r.jina.ai`): 200 with real content, **fully anonymous**,
  no key needed at all. It looked dead all session because of a real bug in
  `web-fetch.server.ts`'s own 401-retry: on a 401/402 it rebuilt the retry
  request's headers from `process.env.JINA_API_KEY` again — the exact same
  invalid key that had just been rejected — so the "fallback" always failed
  identically instead of ever trying anonymously. Fixed to drop the
  Authorization header entirely on retry. This restored a working, free
  capability rather than deleting something that actually works.

Replacement for Search: a self-hosted **SearXNG** instance added to the
Docker stack (`supabase/docker/docker-compose.yml`'s `searxng` service,
`http://localhost:15436`) — aggregates Google CSE + DuckDuckGo (+ others per
SearXNG's default engine set), runs entirely on this machine, no API key, no
externally-imposed rate limit. `jinaSearch` renamed to `localWebSearch`
(same `{ok, hits}` contract) across every real call site
(`discoverer.impl.server.ts`'s fallback-path seeding,
`source-curator/funder-scout.server.ts`).

Verified live, not just typechecked: `funder_scout` — which had failed
**100% of the time** with `jina_search_401` in every run this session —
succeeded in a fresh Tier B trigger: 14 hits, 10 new real Canadian funder
candidates (Global Affairs Canada, IDRC, Environment and Climate Change
Canada, Canada Foundation for Innovation, several municipal climate-grant
programs). Also confirmed SearXNG correctly passes through `site:`-qualified
queries (the exact query shape the discoverer's fallback path uses) with
relevant, on-target results. `tsc --noEmit` clean; full suite still
440 passed / 4 skipped. Same fix independently confirmed and ported to
[PR #2](https://github.com/rafaelcastro7/iialgrants/pull/2) — main's
`web-fetch.server.ts` was 99% byte-identical to this checkout's pre-fix
version, same bug, same result after porting (379 passed / 4 skipped there).

### Loop audit: eslint clean, one dead AI-generated file removed, one real UI inconsistency fixed

Continuing the "sin humo, sin deuda tecnica, sin bugs" system audit — ran
this project's own documented Verification Protocol (`docs/HANDOFF-CODEX.md`)
in full for the first time this session:

- `eslint .` — 4 formatting issues, all in files edited earlier this
  session, no real logic/quality findings. Fixed with `--fix`.
- **Removed `src/agents/scoring-multi-axis.server.ts`** — a complete,
  schema-validated, LLM-based 5-axis grant scorer (relevance/budget_fit/
  timeline/capability/winning_probability) with its own neutral-score
  fallback. Confirmed via `grep` across the entire codebase: zero callers,
  zero test references. A fully-built feature that was never wired to
  anything — the app's real fit-scoring path is `fit-rules.server.ts`'s
  `evaluateRules()` + the evaluator agent, not this. Deleted rather than
  left as dead weight implying a capability that doesn't run.
- **Fixed a real, live fit-score display inconsistency.** Six components
  each hardcode their own copy of the fit-score tier boundaries
  (strong/partial/poor). `GrantDetailExpress.tsx`, `V2GrantDetail.tsx`, and
  `GrantExpressView.tsx` agree on 0.7 / 0.45. `FitEvaluation.tsx` — actively
  rendered on both the legacy grant-detail route and inside
  `V2GrantDetail.tsx` — used 0.4 for its second boundary instead of 0.45.
  Net effect: the same grant, same `fit_score`, in the 0.40–0.449 range,
  showed a **different fit tier depending on which component rendered it**
  on the same page. Aligned to 0.45. `GrantKanban.tsx`'s separate 4-bucket
  scheme (0.8/0.6/0.4) serves a different, deliberately finer board-overview
  granularity — left alone rather than force-unified into the 2-boundary
  scheme the other four share.
- Both fixes independently confirmed present in `main` too (same dead file,
  same 0.4-vs-0.45 mismatch) and ported to
  [PR #2](https://github.com/rafaelcastro7/iialgrants/pull/2).
- Also found and fixed (separately documented in `docs/HANDOFF-CODEX.md`,
  not duplicated here in full): 7 of 9 `/admin/modules` toggles
  (`analytics`, `compliance`, `grants`, `org_profile`, `privacy`,
  `proposals`, and `public_webhooks`) did nothing when flipped off — no code
  anywhere checked them. Fixed `public_webhooks` (gates all 7 cron-triggered
  `/api/public/hooks/*` routes), verified live by disabling the flag and
  confirming a real 503. The other 6 remain open, tracked work — each needs
  its own gate location decided, not a blind copy of the same one-liner.

`tsc --noEmit` clean and full suite (440 local / 379 main, both
440/4-skipped and 379/4-skipped) re-verified after every change in this
section.

### Full e2e re-verification after this session's changes, one real test flake fixed

After the fixes above (Jina/SearXNG, module-flag enforcement, dead-code
removal, tier fix), re-ran the whole local e2e suite to confirm no
regression — not assumed from the unit suite alone:
- `full-lifecycle.spec.ts` (search → enrich → evaluate → draft → critic →
  export → submit): passed, 40s.
- `basic-user.spec.ts` + `proposal-export.spec.ts`: passed.
- `navigation-audit.spec.ts` (member flow): **failed once** with 4
  `SupabaseAuthClient.getUser ... Failed to fetch` errors, then **passed
  reliably in isolation** on immediate re-run — confirmed via repeated runs,
  not assumed benign. Same root cause as the already-documented
  `full-lifecycle.spec.ts` pattern (rapid programmatic navigation aborting
  an in-flight session check under load), just never filtered here. Applied
  the identical filter; re-ran the full 5-test e2e batch afterward — 5/5
  passed.

**`module_flags` vs `agent_flags` (deliberately NOT touched this pass):**
attempted to wire the `proposals` module next and stopped after finding
`runStrategist` (the actual proposal-creation call) already gates on
`assertAgentEnabled("strategist", ...)` — a separate, existing kill-switch
for the same real feature. Adding `assertModuleEnabled("proposals")` on top
would create two independent, possibly-conflicting admin controls for one
capability, which is exactly the unresolved architectural question this
project's own `docs/HANDOFF-CODEX.md` already flagged ("untangling whether
module_flags and agent_flags should merge into one mechanism is a real but
separate architectural question"). `public_webhooks` was safe to fix
because it has no such overlap — no agent_flags equivalent gates the
webhook routes. The remaining 6 modules need this same overlap check done
per-module before wiring, not a blind copy of the `public_webhooks` pattern.

### Verifying `docs/PRODUCT-DIFFERENTIATION.md`'s competitive claims against real code, not just trusting the doc

`docs/PRODUCT-DIFFERENTIATION.md` (dated 2026-07-04, 3+ weeks stale)
compares this app against Instrumentl/Grantable/Granter.ai/FundRobin/Candid
and lists 12 specific differentiator claims. Spot-checked the "Shareable fit
report" claim (#6) — worth checking specifically because the previous
session's V2 redesign rewrote most of the UI, and a differentiator claim
tied to a specific button is exactly the kind of thing a UI rewrite could
have silently dropped.

- First pass: grepped `V2GrantDetail.tsx` for the share button and got no
  hits — looked like the claimed feature was unreachable in the actual
  default UI (V2 is the default per `readInitialUiVersion()`), only present
  in the legacy v1 route nobody sees by default. Almost reported this as a
  "marketed feature that doesn't exist for real users" bug.
- **Caught it before reporting**: re-checked more carefully and found the
  button genuinely is there (`V2GrantDetail.tsx:437-447`, an unconditional
  "Share" button in the grant-detail sidebar) — the first grep just missed
  it. Verified live rather than trusting either the doc's claim or my own
  first (wrong) grep result: signed in, opened a real grant, clicked Share,
  confirmed the clipboard URL opens a working, unauthenticated public report
  page. It's genuinely true. Added `tests/e2e/share-report.spec.ts` — this
  claimed differentiator had 0 rows ever in `shared_fit_reports` and zero
  test coverage before this.
- Lesson for future audits of this doc: don't stop at the first grep result
  when it contradicts a specific, falsifiable claim — re-verify before
  reporting a "the marketing is lying" finding, the same rigor demanded of
  the claim itself.

Remaining claims in that doc (pipeline analytics, evidence-backed
extraction, Express/Advanced parity) are not yet individually re-verified
this pass — flagged as follow-up, not assumed true just because two claims
checked out.

**Claim #12, deadline reminder notifications, also checked out — but only
after manually forcing qualifying data.** `notifications` had 0 `kind =
'deadline'` rows before this: none of the seeded grants had a near-term
deadline on a proposal in a qualifying pipeline stage, so the daily cron
had nothing to ever act on — not evidence of a broken feature, just no
test data that would exercise it. Set the seeded IRAP grant's deadline to
`current_date + 5`, constructed a correctly HMAC-signed request (matching
`webhook-auth.server.ts`'s `${ts}.${nonce}.${rawBody}` scheme) and POSTed
it directly to `/api/public/hooks/deadlines` — created a real "Deadline in
5 day(s)" notification. Confirmed the bell UI genuinely surfaces it
(unread count + deep-linked detail) for the owning user. Added
`tests/e2e/notification-bell.spec.ts`, documented as depending on that
seed-state mutation (matching this suite's existing pattern of assuming
specific seeded grants rather than each spec re-seeding its own data).

## Conclusion

The system works locally end to end against the local Docker Supabase (dev DB):
auth, dashboard, grants + search, grant detail, proposals, submissions,
fit-rules, funders, admin, and all V2 secondary screens render real local data
with no crashes. LLM is hybrid (cloud-first: Cerebras → Groq → Gemini, with
local Ollama as the final fallback). The full grant lifecycle (search →
enrich → evaluate → draft → review → export → submit) is covered by an
automated human-style e2e test in addition to manual verification.

Open items, in priority order:
1. **Merge [PR #2](https://github.com/rafaelcastro7/iialgrants/pull/2)** —
   the 10 security/logic fixes, verified `MERGEABLE`/`CLEAN` against current
   `main`. This is the one piece of the reconciliation that's actually ready
   to land.
2. **Discovery/source-curator subsystem reconciliation** — correction to the
   note originally here: the two sides are NOT as divergent as first assumed.
   Both have essentially the same 11-ingester source-curator pipeline
   (confirmed the `rss_grants_bundle` registry bug is identical on both
   sides — see the funders-module audit above). The genuine local-only
   additions are narrower than first thought: `grants-gov.server.ts`
   (Grants.gov REST API, replacing a dead RSS feed) and
   `regional-development.server.ts`, neither of which exists in `main`.
   Porting just those two (plus the genericity-check/deep-crawl-relevance/
   discovery-config files noted earlier, which sit in the discoverer/enricher
   path, not source-curator) is a much smaller, well-scoped task than a full
   subsystem reconciliation.
3. **The rest of `local-work-2026-07-30` vs. `main`** — PR #1 remains open as
   a record of the full divergence (529 files) but should not be merged as-is;
   whatever in it isn't covered by PR #2 or item 2 above needs its own,
   case-by-case decision.
4. ~~Jina Search API key is invalid (401)~~ — **resolved**: Jina Search
   eliminated entirely (dead, no anonymous tier), replaced by a self-hosted
   local SearXNG instance; Jina Reader's real retry bug fixed instead of
   needing a key at all. See the "Jina Search eliminated" section above.
5. **Review the 22 `pending_review` + 621 `candidate` rows in
   `/admin/candidates`** now that the pipeline actually ran — mostly US
   federal agencies from Grants.gov, correctly held at low score rather than
   auto-approved, but a human should decide whether US-federal is in scope
   for this app before approving any of them into `funders`.
6. The non-fatal React transition warning noted above (dialog-close +
   mutation-`onSuccess` pointer-events race) — mitigated with a defensive
   safety net, not root-caused per-dialog.
7. **6 of 9 `/admin/modules` toggles are still unenforced** (`analytics`,
   `compliance`, `grants`, `org_profile`, `privacy`, `proposals`) —
   `public_webhooks` was fixed this pass; these need their own gate
   locations decided (see `docs/HANDOFF-CODEX.md`'s 2026-07-31 entry for
   where each likely belongs).
