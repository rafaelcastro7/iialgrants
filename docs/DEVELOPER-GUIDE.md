# IIAL Grants - Developer Guide

Technical "about" guide for understanding and extending the system quickly.

Related docs:

- User manual: `docs/USER-MANUAL.md`
- Product context: `docs/PRODUCT-DIFFERENTIATION.md`

## What This System Does

IIAL Grants is a Canada-focused grant intelligence platform. It discovers grant
programs, enriches missing fields from funder pages, evaluates fit against an
organization profile, drafts proposal plans, and keeps citations/evidence for
auditability.

The local development loop is intentionally local-first:

- Supabase runs in Docker through Kong on `http://localhost:15435`.
- Postgres is exposed on `localhost:15432`.
- The app runs on Vite/TanStack Start at `http://localhost:8080`.
- LLM work can run through Ollama on `http://localhost:11434`.
- `bun run check:local` verifies the local stack.

## Environment Architecture (dev vs prod)

One codebase, two databases and a hybrid LLM stack. Full operational detail
(exact keys, restart/CORS gotchas, demo-password reset) lives in
`docs/DRP-MIGRATION-RUNBOOK.md`; the summary:

**Databases** — local dev uses the Docker Supabase (`localhost:15435`);
production (Lovable) uses the Cloud Supabase (`*.supabase.co`). The dev machine
switches to local purely through a `.env.local` file that overrides `.env`
per-key (both Bun and Vite load `.env` then `.env.local`). Both files are
gitignored; Lovable production reads its own dashboard env vars, not any repo
file. Never hand-edit `.env` to switch DBs — create/remove `.env.local` instead.

The local anon/service keys must be the JWTs from this stack's `kong.yml` (issuer
`supabase`), not the generic `supabase-demo` keys, or Kong rejects everything
with `{"message":"Unauthorized"}`. Run the dev server on port 8080 (local
Supabase CORS only allows that origin) and keep it non-elevated so it can be
restarted after env changes.

**LLM router** (`src/agents/llm.server.ts`, `llm-free.server.ts`,
`llm-cloud.server.ts`) is hybrid and picks its path by environment: if Ollama is
reachable (dev) it is local-first; if not (Lovable prod) it uses the cloud chain
**Cerebras → Groq → Gemini** (each skipped when its API key is unset), then still
falls back to local Ollama if the whole cloud chain fails. This is why the app
works both offline on the workstation and deployed to Lovable with no code
change.

## Stack

| Layer           | Technology                                                |
| --------------- | --------------------------------------------------------- |
| Frontend        | React 19, TanStack Start, TanStack Router, TanStack Query |
| UI              | Tailwind CSS 4, shadcn/ui, lucide-react                   |
| Backend         | TanStack Server Functions (`createServerFn`)              |
| Database/Auth   | Supabase Postgres, Auth, RLS                              |
| AI              | Local Ollama plus free-provider cascade when keys exist   |
| Validation      | Zod schemas for agent IO and server inputs                |
| Tests           | Vitest + jsdom                                            |
| Package manager | Bun                                                       |

## Core Flow

1. Discovery creates grant rows from public funder/source pages.
2. Enrichment scrapes the grant page and official detail pages.
3. Deterministic extractors fill amounts, deadline, eligibility, sectors, and
   application requirements.
4. Evaluator combines deterministic rules with LLM scoring.
5. Strategist and writer create proposal structure and draft sections.
6. Critic reviews proposal quality.
7. Evidence spans and trace steps keep the work auditable.

## Agent Pipeline

| Agent      | Purpose                                       | Key files                              |
| ---------- | --------------------------------------------- | -------------------------------------- |
| Discoverer | Find grant programs from funder pages         | `src/agents/discoverer.impl.server.ts` |
| Enricher   | Fill structured grant fields and requirements | `src/agents/enricher.functions.ts`     |
| Evaluator  | Score grant-org fit                           | `src/agents/evaluator.impl.server.ts`  |
| Strategist | Plan proposal sections                        | `src/agents/strategist.functions.ts`   |
| Writer     | Draft sections with citations                 | `src/agents/writer.functions.ts`       |
| Critic     | Review draft quality                          | `src/agents/critic.functions.ts`       |

Shared schemas and prompts live in `src/agents/schemas.ts`.

## Important Data Tables

| Table                | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `grants`             | Grant catalog and enriched structured fields |
| `funders`            | Granting organizations and source metadata   |
| `grant_evaluations`  | Per-user fit scores and rationales           |
| `evidence_spans`     | Field-level citations and snippets           |
| `agent_trace_steps`  | Step-by-step agent execution trace           |
| `agent_runs`         | Agent run metadata, status, latency, tokens  |
| `org_profiles`       | Organization profile used for fit scoring    |
| `shared_fit_reports` | Public read-only report links                |

Recent addition: `grants.requirements` stores deterministic RFP-style
requirements such as required documents, matching funds, portal submission, LOI,
and reporting obligations.

Recent addition: proposal readiness is computed in
`src/lib/proposal-readiness.ts` from existing proposal sections, citations,
planned `must_cover` points, and critical `grants.requirements`. It is rendered
on the proposal detail page without adding a new table.

## Server Function Pattern

Route files should primarily export route components. Server functions belong in
`*.functions.ts` or `*.server.ts` files.

Common pattern:

- Thin route/component in `src/routes`.
- Server function in `src/lib/*.functions.ts` or `src/agents/*.functions.ts`.
- Real implementation in `*.server.ts` when logic is large or reusable.
- Inputs validated with Zod.
- Auth enforced with `requireSupabaseAuth`.
- Admin-only paths additionally call `assertAdmin`.

## Local Commands

```bash
bun run dev          # Vite dev server on :8080
bun run check:local  # local Docker/Supabase/dev-server health check
bun run lint         # ESLint + Prettier rule
bunx vitest run      # unit/e2e test suite
bun run test:e2e     # browser smoke: demo member login -> dashboard -> grants
bun run build        # production client + SSR build
```

For browser automation, Playwright runs against the seeded demo user flow in
`tests/e2e/basic-user.spec.ts`. A deeper route-by-route navigation audit lives
in `tests/e2e/navigation-audit.spec.ts`; it logs in as demo member and demo
admin, clicks the main dashboard/grants/admin links, verifies route readiness,
and fails on browser console/page errors. Install Chromium once with:

```bash
bunx playwright install chromium
```

Live pipeline smoke:

```bash
bun scripts/seed-live-grant.mjs
# then run src/agents/live-pipeline.test.ts with LIVE_GRANT_ID and LIVE_USER_ID
```

The live smoke should end with a grant in `scored` status, persisted evidence,
requirements, and a fit score.

## Local Supabase

Docker compose files live in `supabase/docker`.

Important ports:

- Kong API gateway: `15435`
- Postgres: `15432`
- Auth direct: `15433`
- PostgREST direct: `15434`

Migrations live in `supabase/migrations`. For local schema changes, apply the
migration to Docker Postgres and reload PostgREST after adding new columns.

## Local LLM Notes

The local `.env` is configured to use:

- `OLLAMA_BASE_URL=http://localhost:11434`
- `OLLAMA_MODEL=phi4-mini:latest`
- `OLLAMA_TIMEOUT_MS=120000`

This keeps live local smoke tests reliable on this workstation. If Ollama starts
timing out, restart the Ollama process and verify `http://localhost:11434/api/ps`
does not show a stale large model still loaded.

## Requirements Extraction

`src/agents/grant-requirements-analyzer.server.ts` extracts application
requirements deterministically from grant markdown. It is intentionally
transparent and non-blocking:

- Required documents: financial statements, budget, incorporation proof, support
  letters, work plan, annual report, insurance proof.
- Process constraints: portal submission, two-stage process/LOI, matching funds,
  evaluation criteria, post-award reporting.
- Contact/credential/financial hints are surfaced when detected.

The enricher persists these rows into `grants.requirements`. The grant detail UI
renders them in the "Application requirements" card.

## Grants Workspace Views (Express / Advanced)

`/grants` uses progressive disclosure with a persisted toggle
(`sessionStorage: grants.viewMode`, default `express`):

- **Express** (`src/components/grants/GrantExpressView.tsx`): prioritized list
  (eligible + best fit first), plain-language cards (match score, amount,
  deadline urgency, "You can apply" verdict, 1-line rationale) and a single
  primary action per card. For basic users.
- **Advanced**: the full Kanban board + filters + bulk + drag
  (`GrantKanban.tsx`). For power users.

## Grant Detail Views (Express / Advanced)

`/grants/$id` uses the same toggle + sessionStorage key as the list
(`grants.viewMode`), so the choice persists across pages:

- **Express** (`GrantDetailExpress.tsx`): one-column simple layout — match
  score, amount, deadline urgency, eligibility verdict, 1-line rationale,
  critical requirements only, ONE primary action (Check my fit / Draft a
  proposal). "Show full details" switches to Advanced.
- **Advanced**: the full existing page (stat cards, 6-axis breakdown, raw
  eligibility, requirements, timeline, audit trail, share report, agent trace
  panel) unchanged, gated behind the toggle.

## Proposal Detail Views (Express / Advanced)

`/proposals/$id` has the same toggle pattern (`sessionStorage: proposals.viewMode`):

- **Express** (`ProposalDetailExpress.tsx`): readiness %, per-section plain
  status (Ready/Needs work/Empty), ONE adaptive primary action (draft the next
  unready section → run quality review → submit).
- **Advanced**: full per-section editor, citations, critic findings, export,
  submit dialog — unchanged.

**Routing gotcha**: list route files MUST use the `.index.tsx` suffix
(`_authenticated.proposals.index.tsx`, `_authenticated.grants.index.tsx`).
Without it, TanStack Router registers the list as a parent layout for
`$id` children; since list components have no `<Outlet/>`, the detail route
silently never renders (list content displays instead). Verify any new
list+detail route pair renders the detail page in-browser before shipping.

Nested child routes need the same discipline: if a parent route has a child
route, the parent must render an `<Outlet/>` or intentionally return the child
view when that child URL is active. This was fixed for
`/_authenticated/grants/$id/audit`; before the fix the URL changed to
`/grants/$id/audit` but the grant detail page stayed on screen.

## Navigation Audit Fixes - 2026-07-04

The browser navigation audit found and fixed these real issues:

- `/grants/$id/audit` changed URL without rendering audit content because
  `src/routes/_authenticated.grants.$id.tsx` did not yield to its child route.
- The grant detail page auto-opened the agent trace sheet during background
  enrichment, which could cover top-level navigation controls.
- Admin overview crashed from a missing `ChartTooltip` import in
  `PipelineAnalyticsCard`.
- Admin history emitted React duplicate-key warnings from repeated IDs in
  rendered data.

Current verified command set:

```bash
bun run lint
bun run build
bunx playwright test tests/e2e/navigation-audit.spec.ts
```

## Pipeline Analytics

`src/lib/pipeline-analytics.ts` computes win-rate, funnel counts, median
time-in-stage, and funnel conversion rates purely from `grant_events`
(status transitions) + current grant status — no new table, deterministic and
unit-tested. Exposed via the admin-only `getPipelineAnalytics` server function
(`src/lib/grants.functions.ts`) and rendered by
`src/components/admin/PipelineAnalyticsCard.tsx` on the admin overview
(`/admin`). Instrumentl-style, but every number traces to real events.

## Proposal Readiness

`src/lib/proposal-readiness.ts` computes section coverage before submission:

- Draft content present and long enough to review.
- Citations attached to the section.
- Strategist `must_cover` points reflected in draft text.
- Critical grant requirements reflected somewhere in proposal content.

The proposal detail route renders this as "Proposal readiness" with an overall
score, section status, and open critical requirements. This is intentionally
derived from current data at read time, so no migration is required.

## Onboarding Nudges

Dashboard (`_authenticated.dashboard.tsx`) checks org-profile completeness
(org_name + sectors + jurisdictions) and shows an action-oriented banner
linking to `/org` when incomplete — hidden once complete. This is the
highest-leverage onboarding step: `deriveRulesFromOrg` (fit-rules.shared.ts)
falls back to generic defaults without it.

## Logic Reengineering Audit (2026-07-04)

A deep read-the-full-code-path audit (not grep-based) found and fixed 7 real
logic bugs across scoring, enrichment, and the state machine:

- Cost-share default was in the wrong scale (0.5 vs 0-100), silently failing
  SOP F3 for almost every grant on default rules.
- Enricher wrote the "Rolling" deadline sentinel into a typed date field,
  which failed Zod validation for the ENTIRE patch (not just deadline) and
  permanently stuck grants after 3 attempts, discarding already-correct data.
- `GRANT_TRANSITIONS` (pipeline-stages.shared.ts) had drifted from the LIVE
  `validate_grant_transition()` trigger — always check the live function body
  with `docker exec docker-db-1 psql -U postgres -d postgres -c "\sf
validate_grant_transition"` before editing this file; migrations get
  superseded by later `CREATE OR REPLACE` statements.
- `detectCostShare()` inverted org-share language the same way as
  funder-coverage language (opposite semantics).
- `markGrantsCurated` had its own duplicate, MORE permissive state machine
  instead of reusing `canTransition()`.
- `autoEvaluatePending` wasted round-trips on `"discovered"` grants the
  evaluator always rejects; the evaluator itself didn't gate terminal states.

See `src/agents/fit-rules.reengineering.test.ts` for regression coverage.
`MAX_ENRICH_ATTEMPTS` now lives in `pipeline-stages.shared.ts` (client-safe)
rather than `enricher.functions.ts` (bundles `createServerFn`) so UI
components can import it without risking a server-code leak into the client
bundle — the build's `tanstack-start-core:import-protection` plugin would
catch this at build time if violated.

## Discovery Dedup (C5, 2026-07-05)

`canonicalKey(funderId, title, funderName)` in `discoverer.impl.server.ts`
strips the funder's own name tokens (words, parenthetical acronym, initials
of every word-prefix) from titles before hashing, and sorts tokens — so
"NRC IRAP...", "National Research Council Canada IRAP..." and plain "IRAP..."
collapse to one key per funder. `isGenericTitle` rejects administrative pages
(vaccination policy, asbestos inventory, conflict-of-interest guidance, etc.)
BEFORE the acronym escape hatch that used to rescue them. Regression coverage:
`discoverer.dedup.test.ts` (real-world titles from the 2026-07-04 discovery).
Keys change forward-only; pre-existing duplicate rows are not merged.

Local-first auditing: `node scripts/local-audit.mjs qwen2.5-coder:7b [file]`
runs a zero-cloud-token sweep via Ollama. Expect heavy false-positive "race
condition" labels from the 7B model — triage each finding against the actual
code before acting.

## Discovery Fetch Engine (2026-07-22)

Grant discovery scrapes each known funder's own website for individual
program pages. It is built as a homegrown, local-first equivalent of a
commercial crawling API (Firecrawl) — before reaching for a paid service or
building something new, check whether this stack already covers it.

**The engine ladder** (`src/lib/web-fetch.server.ts`'s `scrapeWithFallback`,
used by the discoverer, enricher, and evidence-gathering steps): each engine
is tried in order until one returns enough content.

| # | Engine | File | What it's for |
| - | ------ | ---- | -------------- |
| 1 | `scrape_engine` | `scrape-engine.server.ts` | Fast path: conditional GET (ETag/If-Modified-Since) + `linkedom` → `@mozilla/readability` (Firefox Reader algorithm) → `turndown` markdown. Robots.txt-aware, per-host throttled (≥1.5s). |
| 2 | `browser_render` | `browser-render.server.ts` | Local headless Chromium (Playwright, already installed for e2e tests — no new infra). Real JS execution, and best-effort clicking of "Eligibility"/"How to apply" tabs/accordions before extraction. Shares the same robots/throttle state as #1. |
| 3 | `jina_reader` | `web-fetch.server.ts` | Remote, free-tier markdownifier. Also handles JS but is third-party and rate-limited. |
| 4 | `raw_html` | `web-fetch.server.ts` | Plain fetch with a realistic desktop Chrome UA. |
| 5 | `raw_html_googlebot` | `web-fetch.server.ts` | Same, with a Googlebot UA — some gov/news sites whitelist it. |
| 6 | `wayback` | `web-fetch.server.ts` | Internet Archive snapshot, for pages that 404/moved. |
| 7 | `archive_today` | `web-fetch.server.ts` | archive.ph snapshot, same purpose, different archive. |

Firecrawl itself (`firecrawl.server.ts`) is also wired in as an optional
preferred path (`discoverFunderImpl`'s "Path A") but is **off by default**
(`USE_FIRECRAWL=0`, empty `FIRECRAWL_API_KEY` in `.env`) — the ladder above is
the active path ("Path B" / `engine: "fallback"` in `agent_runs.metadata`).

**Considered and declined (2026-07-22): self-hosting Firecrawl or Crawl4AI.**
Checked before writing this off — `docker info` on this machine shows Docker
Desktop's own memory budget is ~8.3GB total, already shared across the
running Supabase stack (kong/auth/rest/db/meta). Self-hosted Firecrawl's own
Docker Compose stack (API + Playwright + Redis + RabbitMQ + Postgres) needs
8-12GB **on its own** — there isn't headroom without raising Docker's memory
allocation, a host-level change affecting every other Docker-based project on
this machine, not just this one. Crawl4AI is lighter (~2GB image, ~300MB idle
RAM) but is a Python library/service — this project has zero other Python
dependencies, and it would largely duplicate `browser-render.server.ts` +
`scrape-engine.server.ts`, which already provide equivalent local, free
headless-render + Readability-based extraction in the same Node/TS runtime
everything else here runs in. Conclusion: skip both. If cloud Firecrawl
capacity is ever wanted for its `map()` relevance-ranking specifically (the
one thing the local ladder doesn't replicate), a paid API key is the lower-
friction path — flip `USE_FIRECRAWL=1` and set a real `FIRECRAWL_API_KEY`, no
code change needed.

**Realistic User-Agent, not a self-identifying one.** The discoverer's
funder-index-page fetch used to send `"IIAL/0.1 (+https://iial.ca)"` — a
transparent bot string that gets 403'd by several government-site WAFs
(confirmed empirically against tradecommissioner.gc.ca). Fixed to use the same
realistic Chrome UA (`web-fetch.server.ts`'s exported `CHROME_UA`) already
proven effective everywhere else in the ladder. Never use a self-identifying
UA for a fetch that needs to actually succeed.

**Registration/login walls are tracked, never auto-solved.**
`src/lib/registration-gate.server.ts`'s `detectRegistrationWall` recognizes a
login/signup wall (URL redirected to a `/login`, `/register`, etc. path, or
page text like "sign in to view", "create an account to access", French
equivalents) and — instead of the page silently vanishing into a generic
"page too short" skip — records it in `discovery_registration_gates`
(funder_id + url unique, `times_seen`/`last_detected_at` accumulate on repeat
sightings). Surfaced on `/admin/sources` under "Needs manual sign-up" with
Registered/Not needed actions. **This system never creates accounts on any
external site** — detection and a visibility queue only; a human signs up
and marks the row resolved.

**Per-platform boilerplate filters.** `isNonGrantUrl` / `NON_GRANT_URL_PATTERNS`
in `discoverer.impl.server.ts` reject known non-program pages by URL path.
These were built incrementally from real false positives — most recently,
Salesforce Experience Cloud's standard `/s/...` slugs (`email-verification`,
check-your-email, `unsubscribe-desabonner`, `error500`, `dovdetail`) got
extracted as fake "grant programs" from Innovation Canada's Salesforce
Community site on 2026-07-22. When adding a new funder whose site runs on a
recognizable platform (Salesforce Community, Drupal, WordPress, etc.), check
whether that platform has its own standard utility-page slugs worth
blocklisting up front rather than waiting for a false positive.

**Known hard limits (not attempted to bypass):** Trade Commissioner Service
(tradecommissioner.gc.ca) sits behind an Akamai WAF that returns 403/404
inconsistently to curl, a realistic UA, and even real headless Chromium —
including on its sitemap.xml. Innovation Canada's Salesforce Experience Cloud
page never finishes rendering its grant listing client-side even after 11+
seconds of headless-browser wait (stuck `aria-busy` state), independent of
network/UA — a content-timing issue, not a fetch failure. Both are
documented rather than chased with fingerprint-evasion techniques, since that
crosses from legitimate resilience engineering into active anti-bot
circumvention on sites that have deliberately chosen to block automated
access.

## Self-Improvement System

Yes — a real one, with an explicit safety boundary. Daemon fleet in `scripts/`:

- `self-eval-daemon.mjs` — computes a scorecard (grounding coverage, data
  completeness, duplicate clusters, stuck-at-max-attempts grants, fake test
  accounts, fabricated requirements) and detects regressions against the
  previous cycle (`src/lib/autonomy-logic.ts`'s `detectRegressions` — pure,
  unit-tested).
- `live-audit-daemon.mjs` — continuous code/data audits.
- `self-criticism-daemon.mjs` — self-critique pass.
- `improvement-daemon.mjs` — synthesizes signal from the above (plus recent
  commits) into a prioritized backlog at `scripts/improvement-queue.md`,
  using the local coder model **only when the GPU is idle**
  (`ollamaChatWhenIdle`). **It never edits code or data — it proposes; a
  human or the `/loop` disposes.** That boundary is deliberate.
- `daemon-watchdog.mjs` / `daemon-supervisor.mjs` — process supervision and
  auto-restart.
- `docs/TECHNIQUES.md` — a living list of reusable engineering patterns. Both
  the improvement daemon and a `/loop` session append a bullet here when they
  discover a technique worth repeating (see that file's own header comment).

Surfaced in-app at `/autonomy` (daemon health, regressions, recent lessons).
A daemon is only reported "healthy" if it is both alive (recent heartbeat)
AND has actually emitted signal — a process that's running but has never
logged a cycle is treated as `silent`, not healthy (`daemonHealth` in
`autonomy-logic.ts`).

## Verification Standard

Before calling work complete, run:

```bash
bun run check:local
bunx vitest run
bun run lint
bun run build
```

For pipeline work, also run the live pipeline smoke against local Supabase and
Ollama. Browser verification is expected for UI changes that affect routes or
rendering.

## Known Watchpoints

- Do not rewrite published git history. The branch is connected to Lovable.
- Do not trust LLM claims without checking git diff and running commands.
- Keep generated scratch artifacts out of git (`.playwright-mcp`, screenshots,
  local DOM dumps).
- Prefer deterministic extractors before LLM calls.
- Keep evidence snippets short, source-backed, and visible to users.
- Treat public share links as bearer credentials; access must go through server
  validation, expiry, and revocation checks.
