# Best techniques - IIAL Grants

Reusable engineering patterns proven in this codebase. The Autonomy tab reads
this file's bullet list; the `/loop` appends a technique here when it discovers
one worth repeating.

- Grounding gate: never persist an LLM-claimed fact unless a whitespace-normalized verbatim snippet of it exists in the scraped source (`snippetIsGrounded`). Truncation/filtering can only make the system more conservative, never invent.
- Retroactive DB cleanup: removing a fact-fabricating detector in code does not clean the rows it already wrote. Pair code fixes with one-off cleanup of stored data for fabricated-fact bug classes.
- `.shared.ts` isomorphic modules: pure logic imported by both server (`createServerFn`) and client lets the same rule run in both places without breaking import protection.
- Deep-crawl URL pinning: store `confirmed_source_urls` so enrichment retries re-fetch exact confirmed pages instead of re-discovering from scratch. This is the root fix for non-deterministic extraction.
- loadTier-aware backoff: check the Ollama proxy's `/proxy-health` `loadTier` before heavy local LLM work and skip/retry when the GPU is busy, so background daemons never contend with a foreground pipeline run.
- Checkpoint integrity for batched daemon work: if a daemon audits only part of a changed commit per cycle, track the pending commit and completed files; advance the checkpoint only after every changed file has been processed.
- Evidence-bound improvement prompts: every auto-improvement proposal must cite a concrete metric or log line, avoid already-done recent commits, and return `[none]` when there is no evidenced work.
- Heartbeat is not health: a daemon that only writes a timestamp is not operational evidence. Treat heartbeat-only daemons as `silent` until they produce useful signal.
- Test the self-check, not the vibes: move daemon liveness, health verdicts, regression detection, and log parsing into a pure module with unit tests, then surface that result in the UI.
- `num_predict` output cap: bound local-model output length or a small model can run away generating tokens on a structured-output prompt until it hits the timeout.
- `describe.skipIf(!process.env.X)` gating: fence real, side-effecting, Ollama-hitting tests behind an explicit env var so a plain `vitest run` stays fast and side-effect-free.
- Honest empty states over confident zeros: distinguish "not measured / no data" from a real zero everywhere (fit trend "Not enough data" vs "Stable"; quality "-" vs "0%"; amount "Not extracted" vs "Not published").
- Server-only reads via lazy `await import()` inside the handler, or a `.server.ts` split, keep `node:fs` and other server-only dependencies out of the client bundle.
- Defense-in-depth auth: `requireSupabaseAuth` for identity plus `assertAdmin(context.userId)` for role on every admin server function, plus admin-only RLS on the table. A `createServerFn` endpoint is reachable over HTTP regardless of which route renders it.
- Adversarial verification: every audit finding is independently re-read against current source by a second pass before it is trusted; default to "not a real bug" unless the exact failure scenario is confirmed.
- List routes must be `*.index.tsx`: a detail `$id` route silently fails to render if the sibling list route is not named `.index`.
- Verify the live DB trigger before editing the pipeline state machine (`\sf validate_grant_transition`) because later migrations replace earlier ones with `CREATE OR REPLACE`.
- Reload PostgREST after schema/RLS changes (`NOTIFY pgrst, 'reload schema'`) and add new columns to `types.ts` or `tsc` fails on `.select()`.
- Screenshot-verify UI claims: a visual walkthrough finds fabricated, garbled, duplicated, or overflowing content that code review misses. Also confirm a "blank page" is not just the test's own screenshot timing before calling it a bug.
- Search the complete corpus server-side before ranking; filtering a pre-limited UI page creates invisible false negatives even when the search box appears functional.
- Calibrate fuzzy-search thresholds with one difficult positive typo and one adversarial nonsense query, then preserve and label relevance order in the UI.
- Realistic UA over self-identifying UA: a transparent bot string (`"IIAL/0.1 (+https://...)"`) gets 403'd by WAFs that a proven, already-used realistic browser UA sails through. Never invent a new "polite" UA for a fetch that needs to actually succeed — reuse the one already proven elsewhere in the codebase.
- Track blockers with a concrete human resolution separately from generic failures: a registration/login wall is not the same failure class as a 404 or timeout — it has an actual next step (a human signs up). Detect it specifically and surface it in a visibility queue instead of letting it disappear into an undifferentiated "skipped" bucket. Never have the system attempt the resolution itself (e.g. auto-creating accounts) — detection and tracking only.
- Per-platform boilerplate is a distinct noise category from per-host noise: a URL-path denylist built from one government `.aspx` site's false positives will still miss a completely different set of false positives on a Salesforce Experience Cloud site (`/s/email-verification`, `/s/unsubscribe`, etc.) — those slugs are platform-standard, not site-specific. When onboarding a new source, check what platform it runs on before assuming existing filters cover it.
- Before building a new scraping/rendering engine, check whether the codebase already has one: a from-scratch "local Firecrawl" (robots-aware, throttled, headless-render with interactive tab-reveal, Wayback/archive.today fallback) can already exist and just need its output wired into the one code path that still bypasses it.
- Verify a suspicious "escape sequence bug" against raw file bytes (`charCodeAt`/`JSON.stringify` a `readFileSync`'d slice) before reporting it — terminal/tool rendering of control characters can visually mimic a totally different bug that isn't actually in the source.
