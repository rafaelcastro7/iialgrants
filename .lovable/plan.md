## Objetivo

Rehacer el módulo de Grants para que el Discovery sea **profundo, multi-página y estructurado**, en vez del actual "1 URL → strip HTML → 30 KB de texto al LLM". Borrar los 3 grants/eval actuales y arrancar limpio con un catálogo de funders más serio.

---

## Estado actual (diagnóstico)

- 3 funders, 3 grants en `discovered`, 3 evaluaciones, 1 entrada en `discovery_sources`.
- `Discoverer` descarga **una sola URL** por funder, hace `replace(<[^>]+>)` y manda 30 KB al LLM. Pierde paginación, links a fichas individuales, contenido renderizado por JS.
- Sin extracción estructurada: el LLM "adivina" amount/deadline desde texto plano.
- Hash de dedupe = `sha256(url+title)`, frágil ante variantes de título.

---

## Reingeniería propuesta

### Fase A — Limpieza (1 migración)

- `truncate grant_events, grant_evaluations, grants, discovery_sources restart identity cascade`.
- Borrar los 3 funders demo; el seed de la Fase B los repone con catálogo nuevo.

### Fase B — Catálogo de funders v2 (1 migración de seed)

Mínimo 8 funders canadienses representativos, con `source_url` apuntando al **índice** de programas (no a una landing):

| Funder | Jurisdicción | Source |
|---|---|---|
| Innovation Canada (Business Benefits Finder) | federal | innovation.ised-isde.canada.ca |
| NRC IRAP | federal | nrc-cnrc.gc.ca/en/support-technology-innovation |
| Mitacs | federal | mitacs.ca/en/programs |
| NSERC | federal | nserc-crsng.gc.ca/Professors-Professeurs/Grants-Subs_eng.asp |
| SR&ED (CRA) | federal | canada.ca/en/revenue-agency/services/scientific-research-experimental-development-tax-incentive-program.html |
| Trade Commissioner – CanExport | federal | tradecommissioner.gc.ca/funding-financement |
| Investissement Québec | QC | investquebec.com/quebec/en/financial-products |
| MEI Québec (PSII) | QC | economie.gouv.qc.ca/bibliotheques/programmes |
| Ontario – ONe-key / OCI | ON | oc-innovation.ca/programs |
| Open Government grants & contributions | federal | search.open.canada.ca/grants |

(Adaptable; el seed deja `active=true` solo en 4–5 para no quemar créditos al primer run.)

### Fase C — Pipeline Discovery v2

Cambios al `runDiscoverer`:

1. **Firecrawl como motor de fetching** (vía connector ya documentado en knowledge):
   - `map(source_url, { limit: 50 })` → lista de URLs candidatas dentro del dominio.
   - Filtro heurístico: descartar URLs con `/news/`, `/blog/`, `/events/`, `/contact`, idiomas duplicados (`/fr/` cuando ya tomamos `/en/`).
   - `batchScrape(urls.slice(0,15), { formats: ['markdown'] })` → markdown limpio por página (renderiza JS, sin tags rotos).
2. **Extracción estructurada por página** (no por dominio):
   - Para cada página, una llamada al LLM con `responseFormat: json` y el `DiscoveredGrant` schema (1 grant por página, no array de 50). Schema chico → evita el problema de "too many states" de Gemini.
   - Si la página claramente NO es un programa (markdown < 500 chars o contiene keywords de blog), se salta sin llamar LLM.
3. **Dedupe robusto**:
   - `canonical_key = sha256(funder_id + normalize(title) + amount_range)` donde `normalize` = lowercase + colapsa whitespace + remove punctuation.
   - Si existe, `times_seen++` y `last_seen_at = now()`; nunca duplica por variante de URL.
4. **Conditional fetch reused**: ya está, se mantiene (etag/last-modified en `discovery_sources` a nivel de URL hijo, no solo del índice).
5. **Fallback sin Firecrawl**: si `FIRECRAWL_API_KEY` no está, cae al pipeline actual (fetch + strip HTML) para no bloquear demo.
6. **Telemetría**: cada `agent_runs` registra `urls_mapped`, `urls_scraped`, `urls_skipped`, `grants_inserted`, `grants_seen_again`, `cost_estimate`.

### Fase D — Auto-fit inmediato (ya hecho parcialmente)

- Tras Discovery, encolar `autoEvaluatePending` automáticamente para el admin que disparó "Discover & Enrich" (no solo al cargar `/grants`).
- Enrich queda como tarea **opcional en background** — la UI ya no espera por él, solo se ejecuta para añadir FR-CA cuando el grant pasa a `shortlisted`.

### Fase E — UI Grants

- Banner `"Discovery v2 · powered by Firecrawl"` cuando la connection esté activa.
- Filtros: jurisdiction (federal/QC/ON/…), sector, deadline próximo, solo elegibles (`evaluation.eligibility_pass`).
- Botón Admin "Discover all" muestra progreso por funder (ya tenemos `perFunder[]`, falta render).

---

## Detalles técnicos

- **Connector**: Firecrawl gateway-backed. Antes de la Fase C: `standard_connectors--list_app_connectors` → `connect` para que el usuario enlace su cuenta. Secret inyectado: `FIRECRAWL_API_KEY`. Sin él, fallback.
- **Server function**: `runDiscoverer` se reescribe; misma firma `{ funderId }`. Llamadas LLM siguen vía `callLlm` (Lovable AI gateway). Sin cambio de RLS ni tablas (excepto opcionalmente añadir `discovery_sources.parent_url` para distinguir índice de hijos — incluido en migración de Fase A).
- **Schema DB**: opcionales en Fase A:
  - `funders.source_urls text[]` (multi-URL por funder).
  - `grants.canonical_key text unique` (índice único para el dedupe robusto).
- **Tests**: ampliar `evals/runner.test.ts` con un golden case "página de programa real" mockeada para Discovery v2.

---

## Entregables

1. Migración A: truncate + nuevo seed de funders + columnas opcionales.
2. `src/agents/discoverer.functions.ts` reescrito (Firecrawl + per-page + dedupe).
3. `src/lib/firecrawl.server.ts` helper.
4. Fallback path verificado (sin connector instalado).
5. UI grants con filtros + progreso por funder.
6. Doc `docs/evidence/discovery-v2.md` con diagrama y métricas.

---

## Fuera de alcance

- No tocamos Strategist/Writer/Critic.
- No tocamos auth, ni cron schedulers (siguen apuntando al nuevo `runDiscoverer`).
- No añadimos scraping de PDFs en esta iteración (queda para v3).

---

## Riesgos

- Firecrawl consume créditos: la Fase B limita a 4-5 funders activos y `batchScrape` a 15 URLs/funder → ~75 scrapes por ciclo de discovery.
- Si el usuario no conecta Firecrawl, el fallback sigue siendo el pipeline actual: degradado pero funcional.
