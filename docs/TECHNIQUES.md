# Best techniques — IIAL Grants

Reusable engineering patterns proven in this codebase. The Autonomy tab reads
this file's bullet list; the `/loop` appends a technique here when it discovers
one worth repeating.

- Grounding gate: never persist an LLM-claimed fact unless a whitespace-normalized verbatim snippet of it exists in the scraped source (`snippetIsGrounded`) — truncation/filtering can only make the system more conservative, never invent.
- Retroactive DB cleanup: removing a fact-fabricating detector in code does NOT clean the rows it already wrote — always pair a code fix with a one-off cleanup of stored data for "fabricated fact" bug classes.
- `.shared.ts` isomorphic modules: pure logic imported by BOTH server (createServerFn) and client, so the same rule runs in both places (submit gate, pipeline state machine) without the import-protection build breaking.
- Deep-crawl URL pinning: store `confirmed_source_urls` so enrichment retries re-fetch the exact confirmed pages instead of re-discovering from scratch — the root fix for non-deterministic extraction.
- loadTier-aware backoff: check the Ollama proxy's `/proxy-health` loadTier before heavy local LLM work and skip+retry when the GPU is busy, so background daemons never contend with a foreground pipeline run.
- `num_predict` output cap: bound local-model output length or a small model can run away generating tokens on a structured-output prompt until it hits the timeout.
- `describe.skipIf(!process.env.X)` gating: fence real, side-effecting, Ollama-hitting tests behind an explicit env var so a plain `vitest run` stays fast and side-effect-free.
- Honest empty states over confident zeros: distinguish "not measured / no data" from a real zero everywhere (fit trend "Not enough data" vs "Stable"; quality "—" vs "0%"; amount "Not extracted" vs "Not published").
- Server-only reads via lazy `await import()` inside the handler (or a `.server.ts` split), never a top-level `node:fs` import in a `.functions.ts`, so server-only deps stay out of the client bundle.
- Defense-in-depth auth: `requireSupabaseAuth` (identity) + `assertAdmin(context.userId)` (role) on every admin server fn, AND admin-only RLS on the table — a createServerFn endpoint is reachable over HTTP regardless of which route renders it.
- Adversarial verification: every audit finding is independently re-read against current source by a second pass before it's trusted; default to "not a real bug" unless the exact failure scenario is confirmed.
- List routes must be `*.index.tsx`: a detail `$id` route silently fails to render if the sibling list route isn't named `.index`.
- Verify the live DB trigger before editing the pipeline state machine (`\sf validate_grant_transition`) — later migrations replace earlier ones with `CREATE OR REPLACE`.
- Reload PostgREST after schema/RLS changes (`NOTIFY pgrst, 'reload schema'`) and add new columns to `types.ts` or `tsc` fails on `.select()`.
- Screenshot-verify UI claims: a visual walkthrough finds fabricated/garbled/duplicated content that code review misses; but also confirm a "blank page" isn't just the test's own screenshot-timing before calling it a bug.
