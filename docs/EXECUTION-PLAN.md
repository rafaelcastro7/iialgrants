# EXECUTION-PLAN.md — Orquestación Maestra IialGrants v2.0

> Sistema autónomo de ejecución, validación y auditoría continua.
> Generado: 2026-07-05 | Última actualización: 2026-07-05

## Ciclo de Ejecución

```
┌─────────────────────────────────────────────────────────┐
│                    CICLO POR FASE                        │
│                                                         │
│  1. PLANIFICAR ──→ 2. EJECUTAR ──→ 3. VALIDAR          │
│       ↑                                  │              │
│       │         5. MEJORAR ←── 4. AUDITAR              │
│       │              │                                  │
│       └──────────────┘                                  │
│                                                         │
│  Fase completa → Siguiente fase                         │
│  Todas las fases → Auditoría global → Mejora → Repetir  │
└─────────────────────────────────────────────────────────┘
```

## Estado del Plan

| Fase | Nombre | Features | Estado | % Completado |
|------|--------|----------|--------|-------------|
| 0 | Reingeniería Frontend | 15 | 🔄 EN PROGRESO | 45% |
| 1 | Inteligencia de Fundadores | 5 | 🔄 EN PROGRESO | 80% |
| 2 | Inteligencia Competitiva | 5 | ⏳ PENDIENTE | 0% |
| 3 | Proposal Quality Premium | 7 | ⏳ PENDIENTE | 0% |
| 4 | Post-Award Intelligence | 5 | ⏳ PENDIENTE | 0% |
| 5 | Plataforma y Escala | 7 | ⏳ PENDIENTE | 0% |

## Criterios de Validación Global

Una fase está COMPLETA cuando:
1. ✅ Todos sus features están implementados
2. ✅ `bun run build` pasa sin errores
3. ✅ `bun run lint` pasa sin warnings nuevos
4. ✅ Tests existentes no se rompen
5. ✅ Feature tiene al menos 1 test unitario nuevo
6. ✅ Feature está documentada en AGENTS.md
7. ✅ No hay regresiones en funcionalidad existente

## Lecciones Aprendidas (acumulativo)

Se actualizan al final de cada fase.

---

## FASE 0: REINGENIERÍA FRONTEND

### 0.1 — Shared Authenticated Layout
- [x] Crear `_authenticated.tsx` como layout shell con Sidebar + TopBar + Outlet
- [x] Migrar `/dashboard` al nuevo layout
- [x] Migrar `/grants` al nuevo layout
- [x] Migrar `/proposals` al nuevo layout
- [x] Migrar `/submissions` al nuevo layout
- [x] Migrar `/ops` al nuevo layout
- [x] Eliminar headers duplicados de cada página
- [ ] **Validación:** Todas las rutas authenticated renderizan dentro del layout compartido

### 0.2 — Command Palette (Cmd+K)
- [x] Integrar `command.tsx` existente en el layout
- [ ] Búsqueda de grants por nombre, funder, status
- [ ] Búsqueda de propuestas por título
- [ ] Navegación rápida a rutas
- [ ] Acciones rápidas (New Grant, Run Discovery)
- [x] Keyboard shortcut Cmd+K / Ctrl+K
- [ ] **Validación:** Cmd+K abre palette, resultados aparecen, Enter navega

### 0.3 — Toast System (Sonner)
- [x] Integrar `<Toaster />` de sonner en root layout
- [ ] Reemplazar `window.confirm` en proposal submission
- [ ] Reemplazar `window.prompt` donde exista
- [ ] Reemplazar toasts inline manuales
- [ ] Agregar success/error a: save, submit, delete, move
- [ ] **Validación:** Todas las operaciones user-facing muestran toast

### 0.4 — Skeleton Loading States
- [x] Crear skeleton components reutilizables
- [ ] Agregar `<Suspense>` con skeleton en `/grants`
- [ ] Agregar `<Suspense>` con skeleton en `/grants/:id`
- [ ] Agregar `<Suspense>` con skeleton en `/proposals`
- [ ] Agregar `<Suspense>` con skeleton en `/proposals/:id`
- [ ] Agregar `<Suspense>` con skeleton en `/dashboard`
- [ ] **Validación:** Ninguna página muestra contenido vacío durante carga

### 0.5 — Data Table Component
- [x] Instalar `@tanstack/react-table` si no está
- [x] Crear DataTable reutilizable con sort, filter, pagination
- [ ] Integrar en `/proposals` (sortable por deadline, status)
- [ ] Integrar en `/submissions` (sortable, filterable) — *deferred: inline editing complexity*
- [ ] Integrar en `/admin/history` (expandable rows)
- [ ] Reemplazar `<table>` HTML crudo en `/ops`
- [ ] **Validación:** Tablas son sortables, filterables, con CSV export

### 0.6 — Pagination
- [ ] Crear PaginationBar reutilizable
- [ ] Integrar en lista de grants (Express view)
- [ ] Integrar en lista de proposals
- [ ] Integrar en admin pages (candidates, history, sources)
- [ ] **Validación:** Listas muestran N items por página, siguiente/anterior funcionan

### 0.7 — Mobile Responsive Navigation
- [x] Crear MobileNav con Sheet component
- [x] Hamburger menu en top bar para móvil
- [ ] Bottom nav bar alternativo (opcional)
- [ ] Kanban → Stack view en móvil
- [ ] **Validación:** Navegación funciona en viewport 375px (iPhone)

### 0.8 — Form Validation
- [x] Integrar react-hook-form + zod resolver
- [ ] Migrar `/org` form a react-hook-form
- [ ] Migrar `/auth` form a react-hook-form
- [ ] Migrar `/fit-rules` a react-hook-form
- [ ] Migrar `/submissions` a react-hook-form
- [x] Error messages debajo de cada campo
- [ ] **Validación:** Forms muestran errores inline, no window.alert

### 0.9 — Error Boundaries por Ruta
- [x] Crear RouteErrorBoundary component
- [ ] Agregar errorComponent a cada ruta authenticated
- [ ] Error page con: título, retry button, home button
- [x] Stack trace en dev mode
- [ ] **Validación:** Error en una ruta no crashea la app completa

### 0.10 — Calendar View
- [x] Crear GrantCalendar component
- [x] Month view con deadlines color-coded
- [ ] Week view alternativa
- [ ] Click en fecha → lista de grants
- [ ] Export .ics
- [ ] **Validación:** Calendar muestra deadlines, colores por status

### 0.11 — Micro-animations (Framer Motion)
- [x] Instalar framer-motion
- [x] Page transitions (fade + slide)
- [ ] List item enter/exit animations
- [ ] Modal/drawer open/close
- [ ] Score gauge counter animation
- [ ] **Validación:** Transiciones suaves, no parpadeos

### 0.12 — User Profile Menu
- [x] Avatar dropdown en top bar
- [x] Profile settings link
- [x] Organization settings link
- [ ] Theme toggle (dark/light)
- [x] Sign out
- [ ] **Validación:** Dropdown aparece, links funcionan

### 0.13 — Activity Feed en Dashboard
- [x] Crear ActivityFeed component
- [x] Últimos 10 eventos (grants, proposals, deadlines)
- [x] Timeline visual con icons
- [x] Click → navega a entidad
- [x] Auto-refresh 30s
- [ ] **Validación:** Feed muestra eventos recientes, click navega

### 0.14 — Funder Profile View
- [x] Crear FunderProfile page component
- [x] Card con: nombre, misión, geographic focus
- [ ] Financial health indicators (placeholder data initially)
- [x] Historical grants list
- [ ] Giving patterns chart
- [ ] "Create Grant" button
- [ ] **Validación:** Funder profile muestra datos, botón funciona

### 0.15 — Compliance Dashboard
- [x] Crear ComplianceMatrix component
- [x] Grid: requisitos × secciones
- [x] Status cells: ✅ ⚠️ ❌
- [x] Overall compliance % bar
- [ ] Export PDF
- [ ] **Validación:** Matrix renderiza, compliance % calcula correctamente

---

## FASE 1: INTELIGENCIA DE FUNDADORES

### 1.1 — CRA T3010 Import Pipeline
- [x] Crear script de importación (scripts/import-cra-t3010.ts)
- [x] Crear migración SQL para enriquecer tabla funders
- [ ] Ejecutar importación (86K+ charities canadienses)
- [ ] Verificar datos en Supabase
- [ ] **Validación:** 86K+ funders con datos completos en DB

### 1.2 — Funder Enrichment Service
- [x] Crear server function para enriquecer funder individual
- [x] Scraping de website del funder para misión/foco geográfico
- [x] Detección automática de tipo (foundation, charity, government)
- [ ] **Validación:** Funder profile se enriquece con datos reales

### 1.3 — Funder Search & Discovery
- [x] Búsqueda full-text por nombre, ubicación, categoría
- [x] Filtros: provincia, tipo, estado, ingresos
- [ ] Ranking por relevancia + fit con organización
- [ ] **Validación:** Búsqueda retorna resultados relevantes en <500ms

### 1.4 — Giving History Tracker
- [x] Tabla de grants históricos por funder
- [x] Análisis de patrones: montos, frecuencia, sectores
- [x] Predicción de probabilidad de financiamiento
- [ ] **Validación:** Historial completo visible en funder profile

### 1.5 — Funder Intelligence Dashboard
- [x] Métricas: total funders, por provincia, por tipo
- [x] Gráficos: distribución de ingresos, tendencias de giving
- [ ] Alertas: nuevos funders, cambios de estatus
- [ ] **Validación:** Dashboard muestra métricas reales
