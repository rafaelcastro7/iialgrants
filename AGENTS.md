<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# IialGrants — AI-native Grant Intelligence for Canada

## Project Overview

IIAL (Institute for Innovation in Applied Learning) grant discovery and proposal generation platform. Bilingual (EN/FR) AI agents discover Canadian grants, evaluate organizational fit via deterministic rules + LLM scoring, and generate proposal drafts with citation tracking.

## Tech Stack

- **Frontend**: React 19 + TanStack Start (file-based SSR) + Tailwind v4 + shadcn/ui (new-york style)
- **Backend**: TanStack Server Functions (`createServerFn`) + Supabase (PostgreSQL + Auth + RLS)
- **AI Gateway**: Lovable AI Gateway with free-tier cascade (Groq → Google AI Studio → Cerebras → Ollama fallback)
- **Default LLM**: `google/gemini-2.5-flash` (configurable per agent)
- **Local AI**: Ollama (`qwen3:14b`, `nomic-embed-text`) — zero-cost alternative
- **Validation**: Zod schemas for all inputs/outputs
- **Build**: Vite 8 + Lovable TanStack config plugin
- **Testing**: Vitest (unit + jsdom) — **232 tests passing**
- **Linting**: ESLint 9 + Prettier
- **Package manager**: Bun

## 6-Agent Pipeline

| Agent | Role | Schema |
|-------|------|--------|
| **Discoverer** | Scrape funder pages, extract grant programs | `DiscoveredGrant`, `DiscovererOutput` |
| **Enricher** | Fill missing fields (amounts, deadlines, eligibility) | `EnricherInput`, `EnricherOutput` |
| **Evaluator** | Score grant-org fit (deterministic rules + LLM) | `EvaluatorOutput` |
| **Strategist** | Plan proposal sections and angles | `StrategistOutput` |
| **Writer** | Draft proposal sections with citations | `WriterOutput` |
| **Critic** | Review draft quality, score + findings | `CriticOutput` |

Schemas and prompts: `src/agents/schemas.ts`
Agent configs (DB-driven): `src/lib/agent-config.server.ts`
LLM client: `src/agents/llm.server.ts`

## Deterministic Fit Rules

`src/agents/fit-rules.server.ts` implements IIAL SOP filters:
- **F1**: Legal eligibility (applicant types: nonprofit, charity, municipality, etc.)
- **F3**: Money math (amount range + cost-share cap)
- **F4**: Strategic fit (IIAL capabilities ↔ grant sectors)
- **F5**: Runway (minimum weeks before deadline by role)
- Combined score = `weight_llm * llm_score + (1 - weight_llm) * rule_score`

## Project Structure

```
src/
├── agents/           # 6 AI agents + schemas + LLM client + RAG
│   ├── extractors/   # HTML/Markdown content extractors
│   ├── schemas.ts    # Shared Zod schemas + system prompts
│   ├── llm.server.ts # Lovable AI Gateway client
│   ├── llm-free.server.ts # Free-tier cascade
│   ├── fit-rules.server.ts # Deterministic scoring
│   ├── embeddings.server.ts # Vector embeddings
│   └── *.functions.ts / *.server.ts
├── components/
│   ├── admin/        # Admin sidebar, CrawlLedgerWidget
│   ├── grants/       # GrantKanban, FitEvaluation, AgentTracePanel, GrantCalendar
│   ├── ui/           # shadcn/ui components (47 installed)
│   ├── AppSidebar.tsx    # Shared authenticated layout sidebar + top bar
│   ├── CommandPalette.tsx # Cmd+K global search & navigation
│   ├── DataTable.tsx     # Reusable data table with sort/filter/pagination
│   ├── DocumentManager.tsx # File attachments (upload/delete/list)
│   ├── Skeletons.tsx     # Loading skeletons for all major pages
│   ├── RouteErrorBoundary.tsx # Per-route error boundary
│   ├── NotificationBell.tsx   # Notification bell with unread count
│   ├── LanguageSwitcher.tsx   # EN/FR toggle (currently EN-only)
│   ├── MobileNav.tsx     # Sheet-based mobile navigation
│   ├── PageTransition.tsx # Framer-motion page transition wrappers
│   ├── FormField.tsx     # Reusable form field with react-hook-form
│   ├── ActivityFeed.tsx  # Dashboard activity timeline
│   ├── SubmitDialog.tsx  # Proposal submission dialog with quality gates
│   └── ThemeToggle.tsx   # Dark/light/system theme toggle
├── hooks/            # use-mobile.tsx
├── i18n/             # Bilingual config
├── integrations/
│   └── supabase/     # Client, types, auth middleware
├── lib/              # 55+ server functions (admin, grants, proposals, etc.)
│   ├── documents.functions.ts       # File attachments (upload/delete/list)
│   ├── approval-workflows.functions.ts # Multi-step approval chains
│   ├── compliance-calendar.functions.ts # Deadline tracking + reminders
│   ├── audit-trail.functions.ts     # Change logging with before/after
│   ├── team-collaboration.functions.ts # Tasks + comments
│   ├── reporting-templates.functions.ts # Pre-built funder templates + Logic Model
│   ├── multi-tenant.functions.ts    # Org isolation middleware
│   ├── platform-monitoring.functions.ts # Rate limiting, caching, jobs
│   ├── financial-tracking.functions.ts  # Budget vs actual + YoY
│   ├── impact-measurement.functions.ts  # Outcome tracking + impact
│   ├── renewal-intelligence.functions.ts # Renewal prediction
│   ├── recipient-profiling.functions.ts  # Competitor analysis
│   ├── proposal-quality.functions.ts     # Scoring metrics + trends
│   ├── revision-agent.functions.ts       # Actionable revision plan
│   ├── funder-enrichment.server.ts # CRA T3010 funder enrichment
│   ├── funder-search.server.ts     # Full-text funder search + filters
│   ├── giving-history.server.ts    # Giving patterns + likelihood prediction
│   ├── funder-dashboard.server.ts  # Funder intelligence metrics
│   ├── competitive-intel.functions.ts # Government grants competitive analysis
│   ├── multi-expert-review.server.ts # 6-expert proposal review panel
│   ├── compliance-matrix.server.ts # Funder requirement compliance
│   ├── citation-tracker.server.ts  # Citation extraction + validation
│   ├── post-award.functions.ts     # Outcome tracking + award metrics
│   ├── platform.functions.ts       # Activity tracking + notifications
│   └── *.functions.ts              # Thin wrappers (server function convention)
├── routes/           # TanStack file-based routing (35 authenticated routes)
├── router.tsx        # Route config
├── server.ts         # SSR entry
└── start.ts          # App bootstrap
```

## Key Routes (35 authenticated)

### Core Workflow
| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/dashboard` | Dashboard with activity feed |
| `/grants` | Grant catalog (Kanban + list) |
| `/grants/:id` | Grant detail + evaluation |
| `/grants/:id/audit` | Grant audit view |
| `/proposals` | Proposal list (DataTable) |
| `/proposals/:id` | Proposal editor + sections + DocumentManager |
| `/proposals/:id/revision` | Revision agent (severity-grouped findings) |
| `/submissions` | Submission tracker (DataTable) |
| `/fit-rules` | Fit rule configuration |

### Post-Award Intelligence
| Route | Purpose |
|-------|---------|
| `/post-award` | Outcomes, win rate, reporting deadlines |
| `/financial` | Budget tracking, YoY funding, utilization |
| `/impact` | Impact measurement, outcome details |
| `/renewal` | Renewal likelihood prediction |

### Competitive Intelligence
| Route | Purpose |
|-------|---------|
| `/competitive` | Competitive dashboard (TBS data) |
| `/competitive/recipients` | Recipient profiling + search |
| `/competitive/programs` | Program analysis + filtering |

### Platform & Quality
| Route | Purpose |
|-------|---------|
| `/quality` | Quality dashboard (scoring metrics, trends) |
| `/tasks` | Task assignments (priority, status) |
| `/compliance-calendar` | Deadline tracking + compliance rate |
| `/org` | Organization profile |
| `/ops` | Operations dashboard |
| `/privacy` | Privacy policy |
| `/compliance` | Compliance page |

### Admin
| Route | Purpose |
|-------|---------|
| `/admin` | Admin dashboard |
| `/admin/agents` | Agent configuration |
| `/admin/candidates` | Funder candidates |
| `/admin/history` | Admin history (DataTable) |
| `/admin/modules` | Module management |
| `/admin/sources` | Data sources |
| `/admin/users` | User management |
| `/admin/monitoring` | Rate limiting, caching, jobs |
| `/admin/audit-trail` | Change history |
| `/admin/workflows` | Approval chain configuration |

## Supabase Tables (51 migrations)

Core: `grants`, `funders`, `proposals`, `proposal_sections`, `submissions`, `outcomes`
Agents: `agent_configs`, `agent_flags`, `agent_runs`, `agent_config_audit`
Users: `profiles`, `user_roles`, `org_profiles`
Knowledge: `knowledge_chunks`, `grant_evaluations`, `grant_events`
Sources: `sources`, `crawl_ledger`
Notifications: `notifications`
Competitive: `competitive_grants` (TBS Proactive Disclosure)
Documents: `documents` (file attachments)
Approvals: `approval_workflows`, `approval_steps`, `approval_instances`
Compliance: `compliance_items`
Audit: `audit_trail`
Tasks: `tasks`, `comments`
Logic Model: `logic_models`
Multi-tenant: `organizations` + `org_id` on core tables

## Environment

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — Supabase connection
- `VITE_SUPABASE_*` — Client-side Supabase keys
- `LOVABLE_API_KEY` — Lovable AI Gateway (for production LLM calls)
- Free-tier providers (Groq, Google AI Studio, Cerebras) used when available
- Local AI: Ollama on `:11434` (qwen3:14b, nomic-embed-text)

## Scripts

```bash
bun run dev          # Vite dev server (:8080)
bun run build        # Production build
bun run build:dev    # Development build
bun run lint         # ESLint
bun run format       # Prettier
bunx vitest run      # Unit tests (232 tests)
```

## Conventions

- Server functions: `*.functions.ts` (thin wrapper) + `*.server.ts` (real logic)
- Supabase client: lazy import via `@/integrations/supabase/client.server`
- Auth: `requireSupabaseAuth` middleware + `assertAdmin` guard
- All LLM inputs/outputs validated with Zod
- Bilingual: EN is canonical, FR is on-demand translation
- Coverage threshold: lines 60%, functions 55%, statements 55%, branches 40%
- Build check: `bun run build` must pass before commit
- Lint check: `bun run lint` must pass before commit

## Competitive Position

vs Instrumentl ($179-499/mo): We have AI-native 6-agent pipeline + CRA T3010 data + bilingual + self-hosted at $0
vs Sopact ($5K+/yr): We have funder intelligence + competitive intel + renewal prediction
vs Fluxx ($3K/mo): We have document storage + approval workflows + audit trail + compliance calendar
vs Foundant ($2K/mo): We have logic model + reporting templates + team collaboration

**Unique advantages: $0 cost, Canadian compliance (PIPEDA/Law 25/AIDA), local AI (Ollama), open source**
