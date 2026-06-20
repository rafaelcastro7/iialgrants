# Reingeniería: Drill-Down de Evidencia + LLM Gratuito

## Problema actual

1. **Sin trazabilidad**: cuando el Evaluator dice "fit_score 78" o el Enricher rellena "amount: $50k", no sabemos en qué texto, URL, o párrafo se basó. La UI muestra veredictos sin evidencia auditable.
2. **Dependencia de créditos Lovable**: todo el pipeline (`google/gemini-2.5-flash` vía Lovable AI Gateway) consume créditos del workspace. Pipeline parado cuando se agotan.
3. **Riesgo de alucinación**: el Enricher recibe sólo `title + summary + url` (sin scrape real de la página) → inventa montos/deadlines.

## Solución en 2 ejes

### Eje A — Evidence-First (anti-alucinación + drill-down)

Cada campo extraído por un agente queda anclado a una **cita verificable** (URL + snippet + offset + hash). La UI muestra `[ver fuente]` junto a cada valor.

Nueva tabla `evidence_spans`:
```
id, grant_id, agent (discoverer|enricher|evaluator),
field (amount_cad_max|deadline|fit_score|...),
value (jsonb),                  -- valor extraído
source_url, source_hash,        -- página exacta
snippet (text), snippet_offset, -- 200-400 chars literales
extraction_method,              -- 'regex'|'firecrawl_json'|'llm'|'rule'
confidence (numeric 0-1),
created_at
```

**Reglas duras:**
- Enricher NO puede escribir un campo sin insertar al menos 1 `evidence_span` con `snippet` presente en el markdown crudo (validación: `markdown.includes(snippet.slice(0,80))` antes de commit).
- Evaluator devuelve `criteria_json` ya pero sin links — ahora cada criterio cita el span que lo justifica.
- `confidence` se setea automático: `regex=1.0`, `firecrawl_json=0.9`, `llm=0.6`, `rule=0.95`.

### Eje B — LLM Gratuito + Extracción Determinística

**Cambio clave**: el 70% del trabajo NO necesita LLM. Sólo extracción estructurada.

**Capa 1 — Determinística (sin LLM, sin créditos):**
- **Montos CAD**: regex multilingüe (`$50,000`, `50 000 $`, `jusqu'à 250 000`, `up to $1M`) → `amount-extractor.server.ts`.
- **Deadlines**: `chrono-node` (parser de fechas EN/FR ya instalado, gratis, offline) sobre el markdown.
- **Eligibilidad**: keyword matching contra taxonomía (SMB, non-profit, Quebec-based, etc.) en `eligibility-rules.server.ts`.
- **Sectores**: clasificador por keywords contra lista NAICS-lite.

Resultado: ~70% de grants se enriquecen con `confidence ≥ 0.9` sin un solo token LLM.

**Capa 2 — LLM gratuito (sólo para los huecos):**

Proveedores gratuitos investigados (todos con tier free real y JSON mode):

| Proveedor | Modelo | Free tier | JSON mode | Latencia |
|-----------|--------|-----------|-----------|----------|
| **Google AI Studio** | `gemini-2.5-flash` | 1500 req/día, 1M tok/día | ✅ | ~1s |
| **Groq** | `llama-3.3-70b` | 14k req/día, 6k tok/min | ✅ | ~0.3s |
| **Cerebras** | `llama-3.3-70b` | 14k req/día | ✅ | ~0.2s |
| **OpenRouter** | varios `:free` | 50 req/día base, 1000 si $10 saldo | ✅ | varía |

**Estrategia cascade**:
1. Groq (más rápido, JSON nativo) → 2. Gemini AI Studio (cuota alta) → 3. Cerebras (backup).
Cada uno con su API key como secret. El `callLlm` interno detecta `provider:free` y rutea sin tocar Lovable Gateway.

**Configuración por agente:**
- Discoverer: Firecrawl JSON extraction (ya no requiere LLM en el 90% de casos) + Gemini free como fallback.
- Enricher: 100% determinístico capa 1; LLM free sólo si quedan ≥2 campos vacíos.
- Evaluator: Groq (rápido, barato, evaluación booleana de elegibilidad).
- Strategist/Writer/Critic: Gemini AI Studio free (mejor calidad para texto largo).

Lovable AI queda como **opt-in premium** para Pro/Critic cuando el usuario explícitamente lo pide.

## Drill-Down UI

Nueva ruta `/grants/$id/evidence/$field` (modal o panel lateral):

```
┌─ Amount: $50,000–$250,000 ───────────────┐
│ Source: nrc-irap.canada.ca/programs/ai   │
│ Method: regex • Confidence: 100%          │
│ ─────────────────────────────────────     │
│ "...projects funded up to $250,000        │
│  with a minimum investment of $50,000     │
│  for eligible Canadian SMBs..."           │
│                                            │
│ [Open source page ↗] [Re-extract]         │
└───────────────────────────────────────────┘
```

Cada chip/badge en `FitEvaluation`, `GrantRow`, `/grants/$id` se vuelve clickeable y abre el `<EvidencePanel field="..." />`.

Para el Evaluator, drill-down muestra los 5 criterios con (a) la regla aplicada, (b) el span citado, (c) el sub-score y (d) si fue determinístico o LLM.

## Plan de ejecución (autónomo, sin pedir aprobación intermedia)

**Iteración 1 — Evidence infra** (sin romper nada existente)
- Migración: tabla `evidence_spans` + GRANT + RLS + índice por `(grant_id, agent, field)`.
- Helper `src/agents/evidence.server.ts` con `recordEvidence({grant_id, field, value, snippet, source_url, method, confidence})` + validación de snippet contra markdown.
- Tipos actualizados.

**Iteración 2 — Extractores determinísticos**
- `src/agents/extractors/amounts.server.ts` (regex CAD EN/FR, tests con 12 casos).
- `src/agents/extractors/deadlines.server.ts` (chrono-node wrapper).
- `src/agents/extractors/eligibility.server.ts` (taxonomía).
- `src/agents/extractors/sectors.server.ts` (NAICS keywords).
- Tests unitarios para cada uno (`*.test.ts`).

**Iteración 3 — Free LLM gateway**
- `src/agents/llm-free.server.ts`: cascade Groq → Gemini AI Studio → Cerebras con retry + JSON mode + token accounting en `agent_runs`.
- Secrets requeridos al usuario: `GROQ_API_KEY`, `GOOGLE_AI_STUDIO_KEY`, `CEREBRAS_API_KEY` (los 3 gratis, instrucciones en chat).
- Modificación de `callLlm` existente: nuevo parámetro `tier: "free" | "lovable"`, default `free`.

**Iteración 4 — Reingeniería Enricher**
- Reescribe `enricher.functions.ts`:
  1. Scrapea la página real con Firecrawl (markdown).
  2. Corre extractores determinísticos sobre el markdown → llena lo que pueda + `evidence_spans`.
  3. Si quedan huecos, llama LLM free con el markdown como contexto + pide citas literales.
  4. Valida cada cita LLM contra el markdown; rechaza las inventadas.

**Iteración 5 — Reingeniería Evaluator**
- Reescribe `evaluator.impl.server.ts` para que cada criterio devuelva `{score, rule, evidence_span_id}`.
- Bloquea la evaluación si `enriched_at IS NULL` (fix audit previo).
- Persiste evidencia del veredicto.

**Iteración 6 — Drill-Down UI**
- Componente `src/components/grants/EvidencePanel.tsx` (modal con snippet, link, método, confidence).
- Hook `useEvidence(grantId, field)`.
- Integración en `FitEvaluation.tsx`, `GrantRow.tsx`, `_authenticated.grants.$id.tsx`: cada valor extraído renderiza con `<EvidenceChip>` clickeable.
- i18n EN/FR.

**Iteración 7 — Migración de crons + verificación E2E**
- Crons reactivados apuntando al nuevo pipeline free-tier.
- Test E2E: 1 funder → 5 grants discovered → enriched con evidencia → evaluated con evidencia → UI muestra drill-down funcional.
- Documentación: `docs/evidence/free-tier-pipeline.md` actualizado.

## Detalles técnicos

- **Snippet validation**: normalizar whitespace antes de comparar (`s.replace(/\s+/g, ' ').trim()`).
- **Confidence threshold para auto-promote**: grant pasa a `enriched` si todos los campos críticos (amount, deadline, eligibility) tienen `confidence ≥ 0.7`; si no, `status='enriched_partial'` (nuevo estado, requiere migrar enum).
- **Rate limiting free APIs**: token bucket en memoria por proveedor (Groq 6k tok/min, etc.); cuando se agota, cascade al siguiente.
- **No hardcodear keys**: las 3 keys se piden al usuario vía `add_secret` después de aprobar este plan.
- **Backward compat**: `callLlm({tier:"lovable"})` sigue funcionando para Pro mode opcional.

## Lo que NO se toca

- Schema de `grants`, `funders` (sólo se añade `evidence_spans` y `enrich_attempts` ya existe).
- Discoverer (ya usa Firecrawl JSON, sólo cambia el fallback LLM).
- Auth, RLS, routes públicas.

## Próximo paso tras aprobación

Te pediré las 3 API keys (Groq, Google AI Studio, Cerebras — todas gratis, instrucciones paso a paso de dónde sacarlas) y ejecuto las 7 iteraciones en modo autónomo (High Autonomy Mode).