# IIAL Grants - Developer Guide

Technical "about" guide for understanding and extending the system quickly.

Related product context: `docs/PRODUCT-DIFFERENTIATION.md`.

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
