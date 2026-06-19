# Plan: Fase 0 — Sprint 0 (Esqueleto IIAL Canada)

## Estado: COMPLETADA ✅

### Entregables Fase 0

**1. Lovable Cloud (backend) habilitado**
- Proyecto provisionado, residencia de datos Canadá (ADR-006).
- LOVABLE_API_KEY ya configurada para los 6 agentes futuros.

**2. Esqueleto de seguridad (migración 001)**
- `app_role` enum: admin, member, viewer
- `app_lang` enum: en, fr
- `profiles` (id, org_name, country='CA', preferred_lang)
- `user_roles` (separada — anti-escalada de privilegios)
- `audit_log` (PIPEDA / Law 25, append-only)
- `has_role()` security definer; EXECUTE revocado a public/anon/authenticated
- Trigger `on_auth_user_created` → crea profile + role 'member' por defecto

**3. Scaffolding i18n EN/FR (ADR-008)**
- i18next + react-i18next + LanguageDetector
- `src/i18n/locales/en.json`, `fr.json`
- `<LanguageSwitcher />` con persistencia en localStorage
- `syncClientLocale()` SSR-safe

**4. Auth scaffolding**
- `/auth` — email/password sign-in/sign-up
- `_authenticated` layout con `beforeLoad` gate
- `/dashboard` (protegida) como primera ruta autenticada

**5. Evals harness (RNF — EDD)**
- `src/evals/types.ts` (Zod schemas: GoldenCase, EvalResult)
- `src/evals/golden/evaluator.seed.json` (caso positivo + adversarial)
- `src/evals/runner.test.ts` (gate 1: validación de schema; gate 2: cobertura adversarial)
- Vitest configurado con jsdom

**6. Observabilidad (OTel GenAI stub)**
- `src/lib/otel.ts` con semantic conventions GenAI estables desde día 0
- Exporter OTLP real en Fase 1

**7. CI pipeline**
- `.github/workflows/ci.yml` — lint · vitest · build en cada PR

## Verificación end-to-end (Fase 0)

| Ruta | Esperado | Real |
|---|---|---|
| `/` | 200 (landing bilingüe) | ✅ 200 |
| `/auth` | 200 (formulario) | ✅ 200 |
| `/dashboard` | 307 → /auth (sin sesión) | ✅ 307 |
| `vitest run` | 2/2 pass | ✅ 2/2 |

## Próximo paso: Fase 1 — Discovery + Ingesta

**Cubre RF-001, RF-002, RF-003, RF-005**

- Tabla `funders` y `grants` (state machine: discovered → enriched → scored → shortlisted → in_proposal → submitted → won/lost/expired).
- Agente **Discoverer** (server fn + Lovable AI / Gemini 2.5 Flash) — descubre nuevos grants desde fuentes RSS/HTML.
- Agente **Enricher** — normaliza y completa metadata (montos CAD, deadlines, elegibilidad).
- UI: lista de grants con filtros por sector, monto, deadline, idioma.
- Cron pg_cron → `/api/public/hooks/discover` (firma HMAC).
- Tests: golden set ampliado (5 → 20 cases), gate 3 (LLM-as-judge para Enricher).

**Riesgo principal:** rate limits y bloqueos de scraping de fuentes públicas. Mitigación: usar feeds RSS oficiales del Gobierno de Canadá (Open Data Portal + Grants Canada API) antes de scraping.

---

## Fase 3 — Strategist + Writer + Critic + RAG ✅

### Entregables
- **Tablas nuevas**: `proposal_templates`, `knowledge_chunks` (pgvector 1536), `proposals` (versionado + critic_score), `proposal_sections`, `proposal_citations` (audit trail inmutable).
- **RAG híbrido**: BM25 (FTS GIN) ∪ similitud vectorial (HNSW cosine), fusionados con RRF (k=60). RPC `match_knowledge_chunks` (SECURITY INVOKER, RLS por usuario).
- **Embeddings**: `openai/text-embedding-3-small` (1536 dims) vía Lovable AI Gateway `/embeddings`.
- **Agente Strategist** (Gemini 2.5 Flash): plan de propuesta a partir de grant + perfil + plantilla; crea proposal + sections; transiciona `scored → shortlisted → in_proposal`.
- **Agente Writer** (Gemini 2.5 Flash): redacta una sección con chunks numerados `[d1]..[dN]`, EN + FR-CA. Validador `validateCitations` rechaza marcadores no declarados o chunk_ids fuera del conjunto recuperado.
- **Agente Critic** (Gemini 2.5 Pro): puntaje global 0–1 + findings por sección (info/warn/block) bilingües; persiste en `proposals.critic_score` y `proposal_sections.critic_notes`.
- **Ingesta de conocimiento**: `ingestOrgProfileAsKnowledge` sincroniza el perfil org como chunks embebidos; `ingestKnowledge` para texto manual.
- **UI**: `/proposals` (listado + botón sync RAG), `/proposals/$id` (secciones, draft por sección, run critic, citaciones inline, findings); botón "Draft proposal" en `/grants` para subvenciones `scored/shortlisted/in_proposal`.
- **i18n EN/FR**: todas las cadenas de Fase 3 traducidas (FR-CA).
- **Eval Gate 1 ampliado**: `src/evals/writer.test.ts` — 4 tests unitarios del validador de citaciones (propiedad de seguridad no-negociable ADR-005).

---

## Fase 4 — Submission + Tracking + Outcomes ✅

### Entregables
- **Tablas nuevas** (`submissions`, `outcomes`, `notifications`): RLS por `auth.uid()`, GRANTs explícitos, triggers `set_updated_at`. `outcomes.submission_id` UNIQUE para idempotencia. `notifications` con campos bilingües (`title_en/fr`, `body_en/fr`).
- **State machine extendida**: `submitProposal` transiciona `grants.in_proposal → submitted` y marca `proposals.status='submitted'`; `recordOutcome` transiciona `submitted → won/lost` cuando aplica.
- **Server functions** (`src/lib/submissions.functions.ts`): `submitProposal`, `recordOutcome` (upsert), `listSubmissions`, `listNotifications`, `markNotificationRead`, `exportProposalMarkdown` (Worker-safe, sin deps nativas).
- **Cron diario** `iial-deadline-notifier-daily` (08:00 UTC) → `/api/public/hooks/deadlines` genera notificaciones bilingües para grants con deadline ≤ 14 días en `shortlisted/in_proposal/submitted` (idempotente: dedup 24h por `grant_id`).
- **UI**: `/submissions` (listado + formulario de outcome con resultado, monto CAD, fecha de decisión, feedback); en `/proposals/$id` botones **Submit**, **Export Markdown** y **Run critic**.
- **i18n EN/FR**: nuevas claves `nav.submissions`, `proposals.{submit,exportMd,submitPrompt,confirmationPrompt}`, `submissions.*` con `results.{won,lost,withdrawn,no_response}`.

**Progreso global: 4 de 6 fases (~67%).**

**Próximo paso — Fase 5 (Observability + EDD Gates):** exporter OTel OTLP real con tokens/cost/latency por agente, dashboard `/ops` (admin only) sobre `agent_runs`, golden set ampliado a 20 casos por agente, Gate 4 (pairwise) y Gate 5 (adversarial prompt-injection) en CI.

### Estado de gates EDD
- Gate 1 (unit): 12 tests (schemas + writer validator) ✅
- Gate 2 (golden regression): 2 (runner) ✅
- Gate 3 (LLM-judge Evaluator): 4 + 1 skip placeholder ✅
- Gate 4 (pairwise) y Gate 5 (adversarial Writer/Critic): pendientes Fase 5.

### Verificación
- `vitest run`: **17/17 pass** (1 skip placeholder).
- Migración 005 OK; warnings restantes (vector/pg_net en `public`) son estándar Supabase.

## Progreso: Fase 4 de 6 (~67%)

### Próximo paso — Fase 4: Submission + Tracking + Outcomes
- Estado `in_proposal → submitted → won/lost` con timestamps.
- Exportación de propuesta a PDF/DOCX bilingüe.
- Dashboard de métricas: pipeline por estado, fit_score promedio, win-rate, tokens/costo por agente (OTel + `agent_runs`).
- Notificaciones (deadlines próximos vía pg_cron + email).
- Gate 4 (pairwise A/B Writer): 2 prompts → preferencia LLM-judge.
