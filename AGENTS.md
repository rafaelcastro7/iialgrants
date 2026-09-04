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

> **A successor exists.** `e:/dev/grantdesk` is a clean rebuild of this product
> for grant consultants across the Américas, on its own ports and its own
> database (app 5180, Postgres 15532, gateway 15535) — nothing is shared with
> this repo. It carries forward what was proven here (Grants.gov and Innovation
> Canada ingestion, the cloud LLM chain, RLS-as-isolation) and drops what was
> not: 39 screens became six, 59 tables became fifteen, and search became
> hybrid retrieval measured against a keyword baseline rather than assumed to
> work. Read `e:/dev/grantdesk/CLAUDE.md` before changing anything here that the
> successor also depends on.

> **Best model wins, local always works.**
> Cloud LLM chain for quality, self-hosted Supabase + Ollama underneath so the
> system still runs with every provider down.

## Architecture: quality-first, with a local floor

Inference is **cloud-first**. Agents call Cerebras / Groq / Gemini and fall back
to local Ollama only when the whole chain fails. Storage stays entirely local
(self-hosted Supabase + pgvector), and embeddings are local too.

> This file used to state "100% local, 0 cloud tokens, no external LLM
> providers, no data leaving the machine". That had not been true for some
> time — `llm-free.server.ts` is explicitly CLOUD FIRST — and the claim was
> also mirrored in the UI. Both were corrected on 2026-08-16 after the priority
> was set as *optimal search and result quality*, not data locality.

**Verify before trusting any of this:**

```bash
bun run scripts/check-cloud-llm.ts        # keys valid + every mapped model answers
bun run scripts/benchmark-cloud-models.ts # structured-JSON quality per candidate model
bun run scripts/startup-validate.ts       # all 10 layers, cloud chain included
```

### Best-in-Class Patterns We Adopt

| Pattern | Source | How We Use It |
|---------|--------|---------------|
| **Model Router** | Azure AI Gateway, Anthropic routing | Per-agent model assignment via `model-router.server.ts` — hardware-aware, fallback chain, DB-configurable |
| **Agent Specialization** | Anthropic Agent Research (2025), Multi-agent best practices | 6 dedicated agents, each with purpose-optimized model (phi4-mini for throughput, dolphin3 for honest scoring, qwen3:14b for deep reasoning) |
| **Hybrid Scoring** | Deterministic rules + LLM evaluation | `fit-rules.server.ts` with `F1–F5` SOP filters weighted alongside LLM scores — prevents score inflation, ensures auditability |
| **Local AI Gateway** | Ollama ecosystem + custom circuit breaker | Auto-retry, per-agent fallback models, AbortSignal timeout, all traffic stays on `localhost:11434` |
| **pgvector RAG** | Best-in-class vector search on PostgreSQL | `nomic-embed-text` (274MB) for embeddings, cosine similarity search, same DB as transactional data |
| **Self-Hosted Supabase** | Production-grade local PostgreSQL | `supabase start` gives you Auth, RLS, realtime, pgvector in one command — zero cloud dependencies |
| **Hardware-Aware Scheduling** | Cloud cost optimization patterns | GTX 1070 8GB VRAM VRAM budget: phi4-mini (2.5GB) for high-throughput, dolphin3 (4.9GB) for 2 agents, qwen3:14b (9.3GB CPU-offload) for only the 2 that need deep reasoning |

### Cloud LLM chain (measured, not assumed)

Provider order is **per agent**, because a single order optimises for the wrong
thing. Every agent still traverses the whole chain, so an outage degrades
rather than breaks.

| Agents | Order | Why |
|--------|-------|-----|
| evaluator, critic, strategist, writer | Groq → Cerebras → Gemini | These produce the judgements and prose a person acts on. Groq's `llama-3.3-70b-versatile` is the largest model that answered reliably, and is not slower in practice. |
| discoverer, enricher | Cerebras → Groq → Gemini | High-volume extraction where latency × volume dominates; Cerebras `gemma-4-31b` leads. |

Three findings that cost real quality, all from live probes on 2026-08-16:

- **Gemini's whole rung was dead.** Both mapped `gemini-2.0-*` models had been
  retired (404). `gemini-2.5-pro` and `gemini-2.5-flash-lite` are *listed* by
  `GET /models` but also answer 404 on this account — **being listed is not
  evidence a model can be called.** Only `gemini-2.5-flash` works.
- **A stale comment cost every judgement a 31B model.** The note claiming
  Cerebras `gpt-oss-120b` "truncates" and `zai-glm-4.7` "returns empty" pinned
  all six agents to `gemma-4-31b`. Re-measured: both produce valid structured
  JSON — but `gpt-oss-120b` is *inconsistent* between plain and JSON modes, so
  Cerebras stays on `gemma-4-31b` and quality comes from provider order.
- **Plain and JSON modes are not equivalent.** `response_format=json_object`
  changes whether some models answer at all. evaluator / critic / discoverer /
  enricher request JSON; writer / strategist do not.

### What the local floor still buys

- **Never fully down** — every provider failing degrades to Ollama, not an outage
- **Local embeddings** — `nomic-embed-text` (768d) never leaves the machine
- **Local storage** — self-hosted Supabase + pgvector, RLS enforced

## Project Overview

IIAL (Institute for Innovation in Applied Learning) grant discovery and proposal generation platform. Bilingual (EN/FR) AI agents discover Canadian grants, evaluate organizational fit via deterministic rules + LLM scoring, and generate proposal drafts with citation tracking.

## Tech Stack

- **Frontend**: React 19 + TanStack Start (file-based SSR) + Tailwind v4 + shadcn/ui (new-york style)
- **Backend**: TanStack Server Functions (`createServerFn`) + Supabase (PostgreSQL + Auth + RLS)
- **AI Gateway**: cloud-first chain (`llm-cloud.server.ts`) → local Ollama fallback
- **Model Router**: `src/agents/model-router.server.ts` — per-agent local model assignment
- **Local models**: `phi4-mini` + `dolphin3` (agents), `nomic-embed-text` (embeddings). All three are required — a missing agent model fails as `ollama_prewarm_404` mid-run and silently pushes work to the cloud fallback
- **Validation**: Zod schemas for all inputs/outputs
- **Build**: Vite 8 + Lovable TanStack config plugin
- **Testing**: Vitest (unit + jsdom) + Playwright e2e — **452 unit / 39 e2e passing**
- **Linting**: ESLint 9 + Prettier
- **Package manager**: Bun

## 6-Agent Pipeline

| Agent | Role | Schema | Local Model |
|-------|------|--------|-------------|
| **Discoverer** | Scrape funder pages, extract grant programs | `DiscoveredGrant`, `DiscovererOutput` | `phi4-mini` (fast extraction) |
| **Enricher** | Fill missing fields (amounts, deadlines, eligibility) | `EnricherInput`, `EnricherOutput` | `phi4-mini` (batch JSON) |
| **Evaluator** | Score grant-org fit (deterministic rules + LLM) | `EvaluatorOutput` | `dolphin3` (uncensored scoring) |
| **Strategist** | Plan proposal sections and angles | `StrategistOutput` | `qwen3:14b` (best reasoning) |
| **Writer** | Draft proposal sections with citations | `WriterOutput` | `qwen3:14b` (best prose) |
| **Critic** | Review draft quality, score + findings | `CriticOutput` | `dolphin3` (unfiltered review) |

Schemas and prompts: `src/agents/schemas.ts`
Agent configs (DB-driven): `src/lib/agent-config.server.ts`
Model router: `src/agents/model-router.server.ts`
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

`.env` holds the base values; `.env.local` overrides per key and points dev at
the local stack. **Both Bun and Vite load `.env` then `.env.local`** — never
hand-edit `.env` to switch backends, create or remove `.env.local` instead.

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL`, `SUPABASE_*` | Supabase — local stack is `localhost:15435` |
| `OLLAMA_BASE_URL` | Local Ollama (`localhost:11434`) |
| `OLLAMA_MODEL` | Default local model (`phi4-mini:latest`) |
| `OLLAMA_TIMEOUT_MS` | 3 min timeout for cold starts |
| `CEREBRAS_API_KEY` | Cloud rung 1 — leads for discoverer/enricher |
| `GROQ_API_KEY` | Cloud rung 1 for evaluator/critic/strategist/writer |
| `GOOGLE_AI_STUDIO_KEY` | Cloud rung 3 (`gemini-2.5-flash`) |
| `JINA_API_KEY` | Web fetch (Jina Reader) |

A provider with no key is skipped by the chain rather than failing it.

## Scripts

```bash
bun run dev          # Vite dev server (:8080) + auto-sync watcher
bun run build        # Production build
bun run lint         # ESLint
bun run test         # Unit tests (452)
bun run test:e2e     # Playwright e2e (39) — real Node, never `bunx`

bun run scripts/startup-validate.ts        # 10 live checks; non-zero on failure
bun run scripts/check-cloud-llm.ts         # keys + every mapped model, both modes
bun run scripts/benchmark-cloud-models.ts  # structured-JSON quality per model
bun run scripts/ingestion-daemon.mjs       # continuous catalog refresh (6h cycle)
```

## Startup

`scripts/start-system.ps1` brings up Docker → Supabase containers → Ollama
(pulling any missing model) → web app → ingestion daemon, then runs
`startup-validate.ts` and **fails loudly rather than degrading quietly**.
`scripts/install-autostart-windows.ps1` registers it at logon.

The validation exists because degradation here is silent by nature: a missing
`nomic-embed-text` drops search to lexical-only, a missing `phi4-mini` pushes
agents to the cloud, and a retired cloud model 404s inside an agent run. Each
was a real incident, not a hypothetical.

## Conventions

- Server functions: `*.functions.ts` (thin wrapper) + `*.server.ts` (real logic)
- **Continuity first:** before changing tenancy, profiles, RAG, agent workflow, or
  V2 UX, read `docs/HANDOFF-CODEX.md` and
  `.claude/skills/iial-grants-continuity/SKILL.md`. They record verified Claude
  findings and the cross-agent contracts; code and the latest migrations remain
  the source of truth when documentation conflicts.
- **Tenant contract:** `profiles.org_id` establishes the principal. `org_profiles`
  is shared tenant data, never a personal fact store; `knowledge_chunks` and the
  answer library must be scoped to that same tenant. Do not use an unscoped
  service-role query or invent IIAL facts to make matching appear ready.
- **TanStack import boundary:** a `*.functions.ts` module can be imported by a
  browser route. Do not statically import `*.server.ts` from it; use a shared
  non-server helper or a server-side dynamic import instead.
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
