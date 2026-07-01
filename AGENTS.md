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
- **AI Gateway**: Lovable AI Gateway with free-tier cascade (Groq → Google AI Studio → Cerebras → Lovable fallback)
- **Default LLM**: `google/gemini-2.5-flash` (configurable per agent)
- **Validation**: Zod schemas for all inputs/outputs
- **Build**: Vite 8 + Lovable TanStack config plugin
- **Testing**: Vitest (unit) + jsdom, coverage via v8
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
│   ├── grants/       # GrantKanban, FitEvaluation, AgentTracePanel, etc.
│   └── ui/           # shadcn/ui components
├── hooks/            # use-mobile.tsx
├── i18n/             # Bilingual config
├── integrations/
│   └── supabase/     # Client, types, auth middleware
├── lib/              # 45 server functions (admin, grants, proposals, etc.)
├── routes/           # TanStack file-based routing
├── router.tsx        # Route config
├── server.ts         # SSR entry
└── start.ts          # App bootstrap
```

## Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/grants` | Grant catalog (Kanban + list) |
| `/grants/:id` | Grant detail + evaluation |
| `/grants/:id/audit` | Grant audit view |
| `/proposals` | Proposal list |
| `/proposals/:id` | Proposal editor + sections |
| `/submissions` | Submission tracker |
| `/fit-rules` | Fit rule configuration |
| `/admin/*` | Admin panel (agents, users, sources, modules, history, candidates) |
| `/org` | Organization profile |
| `/ops` | Operations dashboard |
| `/privacy` | Privacy policy |
| `/compliance` | Compliance page |

## Supabase Tables (45 migrations)

Core: `grants`, `funders`, `proposals`, `proposal_sections`, `submissions`, `outcomes`
Agents: `agent_configs`, `agent_flags`, `agent_runs`, `agent_config_audit`
Users: `profiles`, `user_roles`, `org_profiles`
Knowledge: `knowledge_chunks`, `grant_evaluations`, `grant_events`
Sources: `sources`, `crawl_ledger`
Notifications: `notifications`

## Environment

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — Supabase connection
- `VITE_SUPABASE_*` — Client-side Supabase keys
- `LOVABLE_API_KEY` — Lovable AI Gateway (for production LLM calls)
- Free-tier providers (Groq, Google AI Studio, Cerebras) used when available

## Scripts

```bash
bun run dev          # Vite dev server (:8080)
bun run build        # Production build
bun run build:dev    # Development build
bun run lint         # ESLint
bun run format       # Prettier
bunx vitest run      # Unit tests
```

## Conventions

- Server functions: `*.functions.ts` (thin wrapper) + `*.server.ts` (real logic)
- Supabase client: lazy import via `@/integrations/supabase/client.server`
- Auth: `requireSupabaseAuth` middleware + `assertAdmin` guard
- All LLM inputs/outputs validated with Zod
- Bilingual: EN is canonical, FR is on-demand translation
- Coverage threshold: lines 60%, functions 55%, statements 55%, branches 40%
