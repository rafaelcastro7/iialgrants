---
name: local-e2e-lifecycle
description: Run or write end-to-end Playwright tests against this app's full grant lifecycle (search → enrich → evaluate → draft → critic → export → submit) on a local self-hosted stack. Load this before writing new e2e specs, debugging a hung/failing e2e run, or diagnosing "works alone but not in the browser" bugs in this repo.
---

# Local end-to-end lifecycle testing — lessons from real runs

Every item below was hit for real while driving this app through the full
grant lifecycle with Playwright against the local Docker Supabase stack. Skip
straight to whichever symptom matches.

## Running tests: use real Node, not Bun

`bun x vitest run` / `bun run test:e2e` **hang forever** if anything in the
call path touches Playwright's browser launch (`chromium.launch()` spawns a
real Chromium process, but the IPC handshake with Playwright's Node driver
never completes under Bun's runtime — confirmed via `chromium.launch()` in a
bare script: instant under real Node, indefinite hang under `bun`).

Always invoke test runners through real Node:
```
node node_modules/vitest/vitest.mjs run          # unit tests
node node_modules/playwright/cli.js test <spec>  # e2e tests
```
(`package.json`'s `"test"` / `"test:e2e"` scripts already do this — use `bun
run test` / `bun run test:e2e`, not a raw `bunx`/`bun x` invocation.)

## "undefined is not an object (evaluating 'z.object')" under Vitest

This looks like a zod version bug and is tempting to "fix" by pinning zod to
an older version. **Don't** — a stale Vite/Vitest dependency-optimizer cache
was the actual cause every time this was reproduced fresh. Pinning zod
anyway silently breaks the real browser build later (`playwright-core`
bundles its own reference to `zod/v4/core`, which only exists on zod's
3.25.x line — downgrading removes that export and the dev server's Vite
dep-optimizer fails with `"./v4/core" is not exported under the conditions
[...]`).

Fix: clear caches, not the dependency:
```
rm -rf node_modules/.vite node_modules/.cache node_modules/.vitest .tanstack
```
Then re-run. If it still reproduces after a clean cache, that's a real bug —
investigate further before touching zod's version.

## The dev server needs a hard restart after any `bun install`

Vite's dependency optimizer keeps stale state across a long-running `bun run
dev` session. After changing any dependency version, restart the dev server
*and* clear its cache (see command above) — otherwise you get a repeating
`ENOENT ... node_modules/<pkg>/index.js` loop in the client optimizer logs
that has nothing to do with your actual code.

## PostgREST schema cache goes stale after applying migrations by hand

If migrations were applied directly via `psql`/`docker exec` (common when
bootstrapping a fresh local stack — see `apply-migrations.cjs`) **after**
`docker-rest-1` already started, PostgREST's cached schema predates those
migrations. Every Supabase-js write through a newer column/table then fails
with a misleading `Invalid API key` — it is not a key/JWT problem.

Fix: `docker restart docker-rest-1 docker-meta-1` and retry.

## Grant-detail agent actions open a "Chain of thought" trace panel

Clicking **Fetch details** or **Check fit / Re-evaluate fit** on a grant page
opens an `AgentTracePanel` (Radix Sheet, `role="dialog"`, accessible name
"Chain of thought — <agent>"). It stays open and **intercepts every click**
on the page behind it until dismissed. Its open state is mirrored into the
URL's `?run=` query param (see `closeTrace()` in
`_authenticated.grants.$id.tsx`), and closing it also triggers an async
`navigate()` to strip that param — wait for the URL to actually update
before clicking anything else, or a re-render can read the still-stale URL
and reopen the sheet right under your next click:
```ts
const sheet = page.getByRole("dialog", { name: /chain of thought/i });
await sheet.getByRole("button", { name: /close/i }).click();
await expect(sheet).toBeHidden();
await expect(page).not.toHaveURL(/[?&]run=/);
```

## "TypeError: Failed to fetch" from `SupabaseAuthClient.getUser` mid-setup

If your test does several `page.goto()` calls back to back (e.g. sign in →
fill org profile → sync knowledge base → go to a grant), you'll sometimes
see a console error like:
```
TypeError: Failed to fetch
    at async SupabaseAuthClient.getUser (...@supabase_supabase-js.js...)
```
This is the browser correctly aborting an in-flight session check because
the *next* navigation started before it resolved — not a real connectivity
failure. Confirmed live: Docker/Kong/the app were all immediately healthy
right after this fired. Don't chase it as an infra bug; filter this specific
signature the same way as the known React warning below, and don't treat
isolated occurrences of "Failed to fetch" as proof of an outage — a genuine
one shows up as *sustained* failures across many requests, not one
transient line right at a navigation boundary.

## Ollama needs `nomic-embed-text`, not just a chat model

Every `knowledge_chunks` insert (org-profile sync, document upload) calls
`embedText()` (`src/agents/embeddings.server.ts`), which hits Ollama's
`/api/embeddings` with model `nomic-embed-text` — a *separate* pull from
whatever chat model (e.g. `phi4-mini:latest`) you set up for agent calls.
Without it, "Sync knowledge base" silently no-ops (0 rows inserted, easy to
miss since the button just re-enables) and every later `Draft "<section>"`
click hangs on `no_knowledge_chunks` with zero LLM calls ever firing.
```
ollama pull nomic-embed-text
```
Verify with `docker exec docker-db-1 psql -U postgres -d postgres -c "select
count(*) from knowledge_chunks;"` — 0 rows after a sync means the embedding
model is missing, not that the RAG corpus is legitimately empty.

## The Writer agent needs org-profile knowledge chunks first

Drafting any proposal section calls `ragRetrieve()`, which throws
`no_knowledge_chunks: ingest org profile or documents first` if the org has
zero rows in `knowledge_chunks` — silent to a human tester who never sees a
"writer" agent call fire at all (nothing reaches `callLlm`). A brand-new demo
org has no profile and no chunks.

Before drafting anything, in order:
1. `/org` → fill in **Organization name** (required) at minimum, ideally
   also Sectors / Focus areas for a richer RAG corpus → **Save profile**.
2. `/proposals` → click **Sync knowledge base** (labeled "New application"
   before this was fixed — check the button's `onClick`, not just its text,
   if this ever looks wrong again) and wait for it to re-enable.

Only then does `Draft "<section>"` actually produce content instead of
failing before the first LLM call.

## The proposal Express view is "one primary action at a time" by design

`ProposalDetailExpress.tsx` shows exactly one button, in this order, driven
by section state — not a "Draft all" + "Run critic" pair sitting side by
side:
1. `Draft "<next empty section heading>"` — repeat once per section (there
   were 9 in every run so far).
2. Once every section has content: **Run quality review** (this *is* the
   critic — there is no button literally labeled "Run critic" in this view).
3. Once critic-passed: **Submit proposal**.

Loop on the one visible primary button's text rather than hunting for a
fixed set of button names:
```ts
const primaryAction = page.getByRole("button")
  .filter({ hasText: /^Draft "|^Run quality review|^Submit proposal$/ });
```
**Export** and the standalone **Submit** button only exist in the *Advanced*
view — click "Show full details →" first to reach them.

## A passing critic score doesn't guarantee "Submit proposal" appears next

`canSubmit()` (`src/lib/submit-gate.shared.ts`) gates on four independent
things: sections drafted, critic score ≥ `MIN_CRITIC_SCORE_TO_SUBMIT` (0.6),
zero open critical requirements, and readiness score ≥
`MIN_READINESS_SCORE_TO_SUBMIT` (45). A grant whose page lists something like
"Financial statements required" surfaces as an **open critical
requirement** that only a real document upload can clear — no amount of
drafting sections or re-running the critic will ever satisfy it. When that's
still open, the Express view's one-button ladder in
`ProposalDetailExpress.tsx` correctly falls back to showing **Run quality
review** again (there's no "ready to submit" and no "next empty section"),
even with every section Ready and a critic score comfortably above 0.6 —
this is the intended fallback branch, not a stuck UI.

Don't assert the button's *text* changes after a critic run; assert the
*action* happened (it goes disabled while pending, then enabled again), and
head into the Advanced view for the real submit gate regardless — a
`submit_blocked` / "Submit Anyway" force-path is a legitimate, by-design
outcome here, not a failure (see docs/LOCAL-SYSTEM-VERIFICATION.md's own
"Fifth stage verified: Submit" section, which validated exactly this force
path).

## Re-running against the same seeded grant is not idempotent

`V2GrantDetail.tsx` shows **Open proposal** (a link) instead of **Draft
proposal** (a button) once a proposal already exists for that grant —
running the same test twice against an unreset seed grant hits a different
branch than a truly fresh run. Handle both:
```ts
if (await page.getByRole("link", { name: /open proposal/i }).isVisible()) {
  await page.getByRole("link", { name: /open proposal/i }).click();
} else {
  await page.getByRole("button", { name: /draft proposal/i }).click();
}
```

## Don't let Playwright's own action-retries fire a real click twice

`locator.click()` waits for the target to be visible/stable/enabled before
clicking — if your *next* assertion is slow to become true for an unrelated
reason (a dialog blocking it, a disabled state that takes a while to clear),
resist the urge to loosen it by re-issuing the same click in a retry loop of
your own on top of Playwright's built-in one. Two real clicks on an
agent-triggering button fire two real (paid, cloud) LLM calls. Prefer:
explicit `await expect(button).toBeEnabled({timeout})` *before* a single
`.click()`, not a click wrapped in your own retry.

## Verify the actual configured timeout before calling something "a hang"

A discoverer test looked hung past a 120s Vitest timeout while an Ollama
fallback call was mid-flight. The tempting conclusion — "the local LLM
fallback has no timeout, that's a bug" — was wrong, and was reported to the
user before being caught. `src/agents/llm-timeouts.server.ts` defines a real
per-agent timeout (`LOCAL_TIMEOUT_MS`, 180s by default via
`OLLAMA_TIMEOUT_MS`, plus `SLOW_AGENT_TIMEOUT_FLOORS_MS` floors for
writer/evaluator/strategist/critic/enricher). The discoverer *does* get the
180s baseline. The test's own outer timeout was simply shorter than the
thing it was waiting on. Re-run with a longer test timeout before concluding
an agent call hangs forever — check `llm-timeouts.server.ts` for what the
real configured allowance is first.

## Grant discovery fallback path — what's actually live vs. what looks wired but isn't

Verified empirically (live calls, not code-reading) in `discoverer.impl.server.ts`:
- Firecrawl (Path A) is **disabled** in this env (`USE_FIRECRAWL=0`, empty
  key) — everything goes through the fallback (Path B): index-page link
  scoring + sitemap.xml seeding + per-page LLM extraction.
- Jina Search seeding was **broken and has been replaced** (2026-07-30): its
  free/anonymous tier is gone entirely (live 401 `AuthenticationRequiredError`
  even with NO key sent — this isn't just "our key expired," don't waste time
  renewing it). Discovery's search-seeding now calls `localWebSearch()`
  (`web-fetch.server.ts`), backed by a self-hosted SearXNG instance
  (`supabase/docker/docker-compose.yml`'s `searxng` service,
  `http://localhost:15436`) — free, local, no key, no external rate limit.
  Separately: Jina *Reader* (`r.jina.ai`, used for page content extraction,
  a different endpoint) turned out to still work completely anonymously —
  it only looked dead because its own 401-retry bug resent the same invalid
  key. Fixed in place rather than replaced, since it already worked for free.
- The fallback path genuinely inserts into the real `funders`/`grants`
  tables (confirmed via a live run against NRC IRAP: 1 inserted, 5 correctly
  deduped via `crawl_ledger`'s `canonical_key` sha256 hash) — it is not a
  disconnected/self-built table that looks plausible but isn't wired up.
- Typical runtime is ~137s/funder — comfortably inside the discoverer's real
  180s timeout (see above), not evidence of a hang.

## Purging a leaked secret from git history (filter-branch, on Windows without Python)

If `git push` is rejected by GitHub secret-scanning (GH013) for a real key
committed in `.env` history, `git filter-repo` usually isn't available here
(needs Python) — use `filter-branch` instead:
```
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" --prune-empty -- --all
```
Run this via a background task with a long explicit timeout (a full
`--all` rewrite across 1000+ commits on several branches took several
minutes and got killed by the tool's default 3-minute Bash timeout on the
first attempt) — and stop any process that auto-commits (e.g. an
`auto-sync.mjs` watcher) first, or it can commit `filter-branch`'s own
`.git-rewrite/` scratch directory into history mid-rewrite if a run gets
interrupted. If that happens, `.gitignore` it and commit its removal before
re-running.

After the rewrite, `git log --all --diff-filter=A -- .env` can still show
hits — check whether those commits are actually **reachable** before
assuming the purge failed:
```
git branch --all --contains <hash>          # empty = unreachable, just backup refs
git merge-base --is-ancestor <hash> <branch> # authoritative per-branch check
```
`filter-branch` keeps the pre-rewrite state alive under `refs/original/*`
specifically so you can recover from a bad rewrite — these are never pushed
and don't affect `git push`, but delete them for real local hygiene once
you've confirmed the rewrite is good:
```
git for-each-ref --format="%(refname)" refs/original/ | xargs -n1 -r git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```
Confirm with `git count-objects -v` (0 loose, 0 garbage) before trusting a
push won't get blocked again.

## Before force-pushing a rewritten history, fetch and diff against the remote — don't assume you know which side is ahead

A rewritten local `main` was ready to push after the secret purge above.
`git push origin main` was rejected as non-fast-forward — instead of forcing
it, `git fetch origin main` + `git log origin/main --not main` were checked
first, and revealed GitHub already had 800+ commits (a full month of real
UX/security/search work) that this local checkout never had — the local
repo (recovered from a separate network-share clone) and GitHub's `main` had
silently diverged from a shared point weeks earlier. A blind
`git push --force` here would have destroyed a month of someone else's real
work. When a push is rejected as non-fast-forward on a branch you just
rewrote, always check `git log <remote>/<branch> --not <local-branch>
--oneline` (commit count *and* a skim of messages/dates) before deciding
force-push is safe — "I rewrote this so mine must be authoritative" does not
follow. When the two sides both contain real independent work, push the
local side to a new branch name instead of forcing, and leave reconciliation
as an explicit human decision.

## The failure mode that costs 20 minutes every time: asserting instead of reading

Nine separate defects in this suite shared one shape — **assert an expected
state and wait for it, instead of reading the real state and branching.** Each
consumed the whole `test.setTimeout` budget and then reported only
`waiting for locator(...)`, which never names the cause. Found and fixed
2026-08-16; none of the nine was an application bug.

| The assumption | What was actually true |
|---|---|
| The sign-in page loads | It had rendered the error boundary |
| A button changes label | A modal had removed it from the a11y tree |
| "Fetch details" re-enables | It unmounts when enrichment *succeeds* |
| The grant will be eligible | "Not eligible" is a correct verdict |
| Review follows drafting | Only when one is outstanding |
| The Submit button is there | It disappears once submitted |
| The heading is the grant's | The URL flips before the view renders |
| A seeded grant is on page one | Auto-archived; catalog grew 47 → 3,014 |
| A July reminder says "in 5 days" | Seed state expires by construction |

Concretely, when writing specs here:

- **Assert `toBeEnabled()` before `.click()`.** A click on a disabled element
  sits in Playwright's actionability wait until the test times out. Attach a
  message naming what being disabled would mean.
- **Close a modal before asserting on anything behind it.** The "Chain of
  thought" Sheet is a modal Radix dialog; while open, the rest of the page is
  `aria-hidden` and assertions against it can never pass — the failure snapshot
  will contain nothing but the dialog.
- **Success can remove a control.** "Fetch details" unmounts when the grant
  leaves `discovered`, so waiting for it to re-enable fails precisely when
  enrichment worked. Wait for the *next* state instead.
- **Follow the action ladder, don't assume its next rung.** `ProposalDetailExpress`
  offers exactly one primary action; re-running against an already-reviewed
  proposal lands on "Submit proposal", not "Run quality review".
- **A finished mutation is not a successful one.** `onCritic()` reports failure
  as a toast and leaves `critic_score` NULL, so the run continues and dies later
  at the submit gate reporting "not reviewed" — pointing at the wrong thing.
  Assert the success signal, not just that the pending flag cleared.
- **Wait for a view-specific element before reading a heading.** The URL changes
  before the detail view renders, so an immediate `h1` read returns the *list*
  page's heading.
- **Submitting is two-phase.** "Submit Anyway" does not exist on the first pass:
  the plain Submit posts, the server answers `submit_blocked:<reasons>`, and
  only the re-rendered dialog offers the force button. The human-review checkbox
  resets with that re-render, so re-tick it each pass.

## Don't depend on seed state — build the precondition

Two specs asserted against data seeded by hand months earlier. Both failed on a
perfectly healthy system: the notification fixture's "deadline in 5 days" had
long passed (and `notifications` was empty), and the pinned IRAP grant had been
auto-archived by a real failed-fit evaluation.

Write the precondition instead. `notification-bell.spec.ts` now sets a deadline
via the service-role client, signs the deadlines webhook itself
(hex HMAC-SHA256 over `${ts}.${nonce}.${rawBody}`, secret in `webhook_config`),
asserts the hook created a reminder, and only then checks the bell. Where the
assertion needs a real row, take one from the catalog at runtime rather than
hardcoding a title.

Note also: each grant card renders **two** links to the same grant — the title
and an "Open this grant" CTA. Only the title link carries a `title` attribute,
so a bare `a[href^="/grants/"]` yields "Open this grant".

## Models the pipeline needs before any of this works

- `nomic-embed-text` — embeddings; without it search silently degrades to
  lexical-only.
- `phi4-mini` **and** `dolphin3` — the agents themselves. Missing ones fail as
  `ollama_prewarm_404` mid-run, leaving `critic_score` NULL while the UI shows
  the review completing.
- Cloud keys are optional but change which model answers; the chain is
  cloud-first with local as the floor.

`bun run scripts/startup-validate.ts` checks all of this in one pass and exits
non-zero with the specific failure — run it before debugging a spec.
