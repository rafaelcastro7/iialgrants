# IIAL Grants — Diferenciación de producto y mejoras

> Documento para explicar el producto: qué hace mejor que los líderes del mercado
> y por qué. Se actualiza a medida que crece el producto.

## El problema del mercado

Las herramientas líderes de descubrimiento/matching de grants (Instrumentl,
Grantable, Granter.ai, FundRobin, Candid) comparten una debilidad documentada
(2026): **sus matches son un punto de partida, no oportunidades pre-calificadas.**
Hacen matching por keywords + perfil, así que muestran grants "técnicamente
elegibles pero no competitivos" (mismatches de geografía o sector) que el equipo
tiene que filtrar a mano. Instrumentl lo dice explícitamente: *"treat matches as
a starting point for screening, not as pre-qualified opportunities."*

## Cómo puntúan los mejores

| Herramienta | Cómo puntúa el fit | Debilidad |
|---|---|---|
| **Instrumentl** | Perfil (misión, presupuesto, geografía, área) → ranking por keywords | Falsos positivos; número sin desglose |
| **Grantable** | Fit-score de 5 ejes citados (generado por LLM) | Ejes por LLM → no determinista/reproducible |
| **Granter.ai** | Gate elegibilidad org-vs-criterios + ranker aprendido | Caja negra |
| **FundRobin** | Framework 2 pilares (readiness interna + alineación), 4-5 ejes 1-5, umbral 15/20 | Manual, no automatizado |

## Qué hace IIAL Grants mejor

### 1. Elegibilidad org-vs-grant real (no keywords)
El motor de screening compara el **perfil real de la organización** (jurisdicciones,
sectores, foco) contra cada grant, en vez de una lista estática. Un grant de
Ontario en IA puntúa distinto para una org de Ontario/IA que para una de BC/minería.
*(`deriveRulesFromOrg` + hard-gates deterministas → filtra los "elegibles pero no
competitivos" que los líderes dejan pasar.)*

### 2. Desglose multi-eje transparente y **determinista**
Cada grant muestra **por qué** puntúa lo que puntúa, en 6 ejes (Elegibilidad,
Geografía, Misión/Sector, Presupuesto, Timeline, **Capacidad operativa**), cada
uno 0-10 con las razones concretas. A diferencia de Grantable (ejes generados por LLM, no reproducibles),
los nuestros se derivan **determinísticamente** de reglas verificables: mismo
grant + mismo perfil = mismo desglose, siempre. *(`computeAxisBreakdown`.)*

### 3. Anti-alucinación por evidencia citada
Cada dato extraído (monto, deadline, elegibilidad) guarda la **cita literal** de
la página fuente que lo justifica (evidence spans + grounding bidireccional). El
usuario puede auditar cada número. Ningún líder ofrece este nivel de trazabilidad.

### 4. 100% local / costo cero en el core
Descubrimiento, enriquecimiento y evaluación corren contra modelos locales
(Ollama) con cascada a free-tier cloud solo si hace falta. El pipeline completo
(scrape → extractores deterministas → LLM local → grounding → scoring) se ejecuta
sin costo de tokens cloud. Verificado end-to-end contra Supabase local + Ollama.

### 5. Determinismo y auditabilidad (Law 25 / PIPEDA)
Cada decisión es reproducible y trazable: extractores 0% varianza, reglas lógicas,
audit log inmutable (triggers rechazan UPDATE/DELETE), atribución de actor real.

## Estado verificado (2026-07-03)
- Stack local operativo: Supabase (Docker) + Ollama, 48 migraciones limpias.
- Pipeline vivo verde: enrich + evaluate contra DB real, montos correctos, fit + desglose por ejes persistidos.
- Calidad de ingeniería: TypeScript 0 errores, ESLint 0 warnings, 109 tests, build limpio.

## En construcción (roadmap)
- Reporte de fit compartible sin login (estilo Grantable).
- Gate presupuesto-vs-capacidad del org (dimensión "operational capacity").
- Extracción de requisitos de RFP + cobertura por sección (estilo Grant Assistant).
- Dashboard win-rate + pipeline analytics (estilo Instrumentl).
