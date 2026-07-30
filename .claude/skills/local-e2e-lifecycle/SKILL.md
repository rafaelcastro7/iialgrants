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
