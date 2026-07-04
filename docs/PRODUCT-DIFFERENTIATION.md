# IIAL Grants - Product Differentiation

Context document for explaining what the product does better than market leaders
and what we are improving next.

## Market Problem

Leading grant discovery and matching tools (Instrumentl, Grantable, Granter.ai,
FundRobin, Candid) generally treat matches as a screening starting point, not as
pre-qualified opportunities. Keyword/profile matching can surface grants that
are technically eligible but not competitive, leaving teams to manually filter
geography, sector, budget fit, readiness, and proposal burden.

## How Competitors Score Fit

| Tool        | Fit approach                              | Weakness                                             |
| ----------- | ----------------------------------------- | ---------------------------------------------------- |
| Instrumentl | Profile fields plus keyword ranking       | False positives; limited deterministic breakdown     |
| Grantable   | LLM-generated cited fit score across axes | Useful, but less reproducible than rule-derived axes |
| Granter.ai  | Eligibility gate plus learned ranker      | Black-box scoring                                    |
| FundRobin   | Manual readiness/alignment rubric         | Strong framework, but not automated                  |

## What IIAL Grants Does Better

### 1. Real org-vs-grant eligibility

The screening engine compares the real organization profile against each grant
instead of relying on static keywords. Jurisdiction, sector, stage, legal
eligibility, funding range, runway, and operating capacity are evaluated against
deterministic rules.

### 2. Transparent deterministic fit dimensions

The grant detail page shows "Fit by dimension": eligibility, geography,
mission/sector, budget, timeline, and operational capacity. These are derived
from reproducible rules, so the same grant plus the same organization profile
produces the same breakdown.

### 3. Evidence-backed anti-hallucination

Extracted fields such as amount, deadline, eligibility, and sectors are backed by
evidence spans. Users can inspect the source snippet behind important claims.

### 4. Local-first, low-cost AI core

Discovery, enrichment, and evaluation can run through local Supabase plus
Ollama, with the free-provider cascade available when configured. This keeps the
core development loop cheap and auditable.

### 5. Law 25 / PIPEDA-oriented auditability

Agent runs, trace steps, evidence spans, RLS, and immutable audit patterns make
the pipeline inspectable and suitable for a compliance-sensitive Canadian grant
workflow.

### 6. Shareable fit report

The "Share report" flow creates a public read-only report link with expiry and
revocation. It lets teams circulate a fit decision without requiring every
stakeholder to have an account.

### 7. Grant Assistant-style application requirements

The enricher now extracts RFP-style requirements such as documents, online portal
submission, two-stage LOI processes, matching funds, evaluation criteria, and
reporting obligations. These are persisted in `grants.requirements` and shown on
the grant detail page before drafting begins.

### 8. Proposal section coverage

The proposal detail page now computes readiness from existing data:

- Draft coverage per section.
- Citation presence per section.
- Missing planned `must_cover` points.
- Critical grant requirements not yet reflected in proposal content.

This moves the product from "draft generator" toward a proposal operating system:
teams can see what is ready, what needs evidence, and what funder requirements
are still open.

### 9. Express / Advanced views (progressive disclosure)

Grants list, grant detail, and proposal detail each have an Express mode
(prioritized list or single readiness card, plain language, one primary
action) and an Advanced mode (the full Kanban / 6-axis breakdown / per-section
editor). A single tablist toggle, persisted in `sessionStorage`, carries the
choice across pages. Basic users never see pipeline jargon; power users lose
nothing.

### 10. Action-oriented onboarding

The dashboard checks whether the org profile (name, sectors, jurisdictions) is
complete and shows a single actionable banner when it is not — "Complete your
organization profile — takes 2 minutes and powers real fit scoring." It
disappears once complete instead of nagging. This targets the single
highest-leverage gap: an incomplete profile silently degrades every fit score
to generic defaults.

### 11. Pipeline analytics (win-rate, funnel, time-in-stage)

An admin-only panel derives win rate (`won / (won + lost)`), per-stage funnel
counts, median days spent in each stage, and funnel conversion rates —
entirely from the `grant_events` transition timeline. No estimates, no new
table: same events, same numbers, every time.

### 12. Deadline reminder notifications

The daily cron already computed bilingual, deduplicated deadline reminders
(14-day horizon) into a `notifications` table with zero UI reading it. A
notification bell (dashboard + grants list) now surfaces unread count and
reminder detail with a deep link to the grant, closing the last gap against
Instrumentl's multi-touch reminders.

## Verified State (2026-07-04)

- Local stack operational: Supabase Docker, Kong, PostgREST, Vite dev server.
- Live pipeline green against local Supabase plus Ollama `phi4-mini:latest`.
- Grant requirements extraction persisted and visible in UI.
- Shareable report flow shipped.
- Proposal readiness/section coverage implemented from existing proposal and
  grant data.
- Quality gates green after the latest change: TypeScript, ESLint, targeted
  tests, full test suite, build, and local stack check should be run before each
  handoff.

## Next Product Bets

- Improve requirement-to-section mapping so each critical requirement suggests
  the most relevant proposal section.
- Add browser verification screenshots for the grant detail and proposal detail
  flows after every UI change.
- Pipeline analytics and deadline reminders shipped (see features 11-12);
  next candidate: surface win-rate trends over time, not just current snapshot.
- Notification bell is dashboard/grants-list only; extend to proposal detail
  and the audit/ops pages once a shared header component exists.
