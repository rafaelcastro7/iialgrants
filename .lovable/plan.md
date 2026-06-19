ns# Plan: Documento de Ingeniería de Software v3 (SDD + SRS)

## Diagnóstico del v2

El v2 ya es un buen **plan de producto**: tiene personas, fases, KPIs, riesgos, DDL y wireframes ASCII. Pero **no es un documento de ingeniería**. Le faltan las piezas que un equipo de desarrollo, un tech lead o un auditor esperarían antes de firmar el arranque:

- No hay **requisitos numerados y trazables** (RF-001, RNF-001…) que se puedan mapear a tests.
- No hay **contratos de API** (endpoints, payloads, códigos de error, idempotencia).
- No hay **contratos de los agentes LLM** (prompt, schema JSON de entrada/salida, política de reintentos, modo degradado).
- El **modelo de datos** está en DDL pero sin diagrama ER, sin diccionario de datos campo a campo, sin invariantes ni reglas de borrado.
- No hay **diagramas de secuencia** del flujo crítico (descubrir → evaluar → proponer).
- No hay **máquina de estados** del grant ni de la propuesta.
- No hay **arquitectura C4** (contexto, contenedores, componentes).
- No hay **estrategia de testing** (pirámide, cobertura objetivo, fixtures, datos sintéticos).
- No hay **observabilidad** definida (logs estructurados, métricas, trazas, alertas).
- No hay **seguridad** detallada (modelo de amenazas STRIDE, controles, manejo de PII, secretos).
- No hay **NFRs medibles** (p95 < X ms, uptime, RPO/RTO, presupuesto de costo LLM por evaluación).
- No hay **versionado, branching, CI/CD, definición de "done"**.
- No hay **matriz de trazabilidad** requisito → diseño → código → test.

## Qué entrego en el v3

Un único documento DOCX (`IIAL_SDD_v3.docx`), estructurado como un **Software Design Document + Software Requirements Specification** profesional. Apunta a ~25–35 páginas, denso, sin relleno.

### Estructura del documento

**Front matter**
- Portada con versión, fecha, autor, estado (Draft for review), control de cambios v1→v2→v3.
- Tabla de contenidos.
- Lista de figuras y tablas.
- Glosario y acrónimos (ampliado del v2).

**1. Introducción**
- 1.1 Propósito del documento y audiencia (dev, QA, PM, stakeholder).
- 1.2 Alcance del sistema (in / out, explícito).
- 1.3 Definiciones, supuestos y dependencias.
- 1.4 Referencias normativas (spec original IIAL, GDPR, etc.).

**2. Visión del producto** (condensado del v2, 1 página)
- Problema, usuarios, propuesta de valor, KPIs de negocio.

**3. Requisitos**
- 3.1 **Requisitos funcionales (RF-001…RF-0NN)** en tabla: ID, descripción, actor, precondición, postcondición, prioridad (MoSCoW), fase.
- 3.2 **Requisitos no funcionales (RNF-001…)** medibles: rendimiento (p50/p95), disponibilidad (99.5%), costo LLM por evaluación (< $0.05), seguridad, usabilidad, accesibilidad WCAG 2.1 AA, i18n.
- 3.3 **Casos de uso** UC-01…UC-05 en formato Cockburn (actor, escenario principal, extensiones, excepciones).
- 3.4 **Historias de usuario** vinculadas a RF, con criterios de aceptación Gherkin (Given/When/Then).

**4. Arquitectura (modelo C4)**
- 4.1 **Diagrama de contexto (C1)** — sistema, usuarios, sistemas externos (Gemini, fuentes de grants, email).
- 4.2 **Diagrama de contenedores (C2)** — frontend TanStack, server functions, Lovable Cloud DB, AI Gateway, storage.
- 4.3 **Diagrama de componentes (C3)** del módulo Agents — los 6 agentes como componentes, interfaces, dependencias.
- 4.4 Decisiones de arquitectura (**ADRs** numerados): ADR-001 TanStack vs Next, ADR-002 Gemini vs OpenAI, ADR-003 server functions vs edge functions, ADR-004 @xyflow/react vs custom canvas.
- 4.5 Vista de despliegue (hosting, regiones, escalado).

**5. Modelo de datos**
- 5.1 **Diagrama ER** (ASCII/mermaid renderizado a imagen).
- 5.2 **Diccionario de datos**: por tabla, una tabla con columna, tipo, nullability, FK, default, invariante, índice.
- 5.3 DDL completo con RLS, GRANTs, índices, triggers (revisado del v2).
- 5.4 **Máquina de estados del Grant**: `discovered → enriched → scored → shortlisted → in_proposal → submitted → won/lost/expired` con triggers de transición.
- 5.5 Máquina de estados de Proposal y de AgentRun.
- 5.6 Política de retención y borrado (GDPR).

**6. Contratos de API**
- 6.1 Convenciones (versionado, errores RFC 7807, idempotencia, paginación cursor-based).
- 6.2 Server functions internas: por cada una, signature TS, validación Zod, errores, ejemplo request/response.
- 6.3 Endpoints públicos `/api/public/*` (webhooks de fuentes, healthcheck): método, headers, payload, firma HMAC.

**7. Contratos de los 6 Agentes LLM**
Para cada agente (Discoverer, Enricher, Evaluator, Strategist, Writer, Critic):
- Responsabilidad única.
- **System prompt versionado** (extracto, versión semántica, ubicación en repo).
- **Input schema** (Zod/JSON Schema).
- **Output schema** (Zod/JSON Schema, validado antes de persistir).
- Modelo LLM, temperatura, max tokens, presupuesto de costo por llamada.
- Política de reintentos (exponential backoff, n=3), timeout, circuit breaker.
- **Modo degradado** (qué pasa si el LLM falla — fallback a heurística, queue para reintento).
- Métricas observables (tokens, latencia, tasa de éxito de validación).

**8. Diseño de UI/UX**
- 8.1 Sistema de diseño (tokens: color, tipografía, spacing, radius) — referencia al `styles.css`.
- 8.2 Inventario de pantallas con propósito y RF asociados.
- 8.3 Wireframes (ASCII para v3 — los mockups visuales vienen en fase de build).
- 8.4 Estados de cada pantalla: loading, empty, error, success.
- 8.5 Accesibilidad: contraste mínimo, navegación por teclado, ARIA.

**9. Flujos críticos (diagramas de secuencia)**
- 9.1 Descubrimiento de un grant nuevo (Discoverer → DB → Enricher).
- 9.2 Evaluación end-to-end (usuario pulsa "Evaluate" → Evaluator → 6 filtros → score → UI).
- 9.3 Generación de propuesta (Strategist → Writer → Critic loop → draft).
- 9.4 Autenticación y autorización.

**10. Seguridad**
- 10.1 **Modelo de amenazas STRIDE** por componente (Spoofing, Tampering, Repudiation, Info disclosure, DoS, Elevation).
- 10.2 Controles: auth (Supabase), authz (RLS + roles), secretos (Lovable Cloud env), HTTPS, CSP, rate limiting, input validation (Zod en todo borde).
- 10.3 Manejo de PII (perfil de la organización, no datos personales sensibles).
- 10.4 Inyección de prompt: sanitización de inputs que llegan al LLM, output validation, no ejecutar código generado.
- 10.5 Auditoría: tabla `audit_log` para acciones críticas.

**11. Observabilidad**
- 11.1 **Logging** estructurado JSON (correlation_id, user_id, agent, latency_ms, tokens, cost_usd).
- 11.2 **Métricas** RED (Rate, Errors, Duration) por server function y por agente.
- 11.3 **Trazas** distribuidas para la cadena Strategist→Writer→Critic.
- 11.4 **Alertas**: error rate > 5%, costo LLM diario > umbral, latencia p95 > SLO.

**12. Estrategia de testing**
- 12.1 Pirámide: unit (Vitest), integración (server functions con DB de prueba), E2E (Playwright) en flujos críticos.
- 12.2 **Cobertura objetivo** por capa (unit 80%, integración 60%, E2E top 5 flujos).
- 12.3 Testing de agentes LLM: dataset dorado (golden set) de 20 grants etiquetados, evaluación de regresión de prompts, snapshot de outputs validados por schema.
- 12.4 Fixtures y datos sintéticos.
- 12.5 Definición de "Done" por historia de usuario.

**13. CI/CD y entorno**
- 13.1 Branching (trunk-based, PRs cortos).
- 13.2 Pipeline: lint → typecheck → test → build → preview deploy → manual promote.
- 13.3 Entornos: dev (preview), staging, prod.
- 13.4 Migraciones de DB versionadas.
- 13.5 Versionado semántico de prompts.

**14. Plan de ejecución**
- 14.1 Fases (heredadas del v2) ahora con: requisitos cubiertos (RF-X..RF-Y), esfuerzo, riesgos específicos, criterio de salida medible.
- 14.2 Roadmap timeline con dependencias.
- 14.3 Equipo mínimo y roles.

**15. Riesgos** (ampliado del v2)
- Riesgo, categoría (técnico/producto/regulatorio), probabilidad, impacto, mitigación, dueño, trigger de escalado.

**16. Fuera de alcance** (heredado del v2, explícito).

**17. Anexos**
- A. **Matriz de trazabilidad** RF → componente → archivo → test.
- B. Lista completa de ADRs.
- C. Plantilla de PR y de release notes.
- D. Convenciones de código (lint config, naming).
- E. Changelog del documento (v1 → v2 → v3).

## Cómo lo voy a producir

1. Escribir `/tmp/sdd_v3.md` con todo el contenido (markdown extendido).
2. Generar diagramas mermaid (C1/C2/C3, ER, secuencia, máquina de estados) → renderizar a PNG con mermaid CLI → embeber en el DOCX.
3. Construir el DOCX con `docx-js` siguiendo el skill (estilos custom, TOC, tablas con doble width DXA, sin bullets unicode, US Letter explícito).
4. **QA visual obligatorio**: convertir todas las páginas a JPG con LibreOffice + pdftoppm, revisar overflow, tablas cortadas, diagramas legibles. Iterar hasta que esté limpio.
5. Entregar `IIAL_SDD_v3.docx` en `/mnt/documents/` junto a los anteriores (no sobreescribo el v2).

## Lo que NO voy a hacer en el v3

- No es un manual de usuario.
- No incluye código de producción real (solo signatures, schemas y DDL).
- No reemplaza las decisiones de diseño visual (eso viene cuando arranquemos Fase 1).
- No es un documento "vendor" comercial — es interno de ingeniería.

## Decisión a confirmar antes de generar

¿Apruebas esta estructura para el v3, o quieres ajustar el alcance? Tres opciones:

- **A. Full SDD+SRS** como está descrito arriba (~30 páginas, exhaustivo, listo para auditoría/handoff a equipo).
- **B. SDD técnico solo** (sin sección de requisitos formales numerados ni casos de uso Cockburn — más corto, ~20 páginas, enfocado en arquitectura/contratos/seguridad).
- **C. SRS solo** (requisitos formales + casos de uso + matriz de trazabilidad, sin arquitectura profunda — útil si el desarrollo lo hace otro equipo).

Mi recomendación: **A**, porque el documento fuente original ya pretendía ser ambas cosas y así cerramos el hueco completo.
