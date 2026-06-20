# Consola Admin — Usuarios & Módulos

Nueva ruta `/_authenticated/admin` (gate adicional: `has_role('admin')`) con dos pestañas profesionales: **Usuarios** y **Módulos**. Sidebar persistente con shadcn `Sidebar` para navegación de la consola.

## Alcance

### 1. Gestión de usuarios
- Tabla con: email, nombre, rol (`admin` / `member`), idioma preferido, último login, fecha creación, estado (activo / baneado).
- Acciones por fila:
  - **Promover / degradar** rol (admin ↔ member) → upsert/delete en `user_roles`.
  - **Resetear contraseña** → envía magic link / recovery via Auth Admin API.
  - **Banear / reactivar** → `auth.admin.updateUserById({ ban_duration })`.
  - **Eliminar** (con confirmación dura, dispara DSAR audit log) → `auth.admin.deleteUser`.
- Botón **"Invitar usuario"** → modal con email + rol inicial → `auth.admin.inviteUserByEmail`.
- Filtro búsqueda por email + selector de rol.
- Todo vía `createServerFn` con `requireSupabaseAuth` + verificación `has_role(uid, 'admin')` antes de `supabaseAdmin`.

### 2. Gestión de módulos
- 8 módulos del producto registrados como flags:
  `grants_discovery`, `evaluator`, `strategist`, `writer`, `critic`, `submissions`, `rag_org_profile`, `public_webhooks`.
- Vista grid con switch on/off por módulo, descripción, agente vinculado, y badge de estado.
- Toggle off → desactiva entrada al módulo en la nav + bloquea server fns asociadas (middleware `requireModuleEnabled('writer')` que lee `module_flags`).
- Audit trail: cada toggle inserta en `audit_log` (actor, módulo, on/off, timestamp).

### 3. Nueva tabla `module_flags`
- Columnas: `module` (text PK), `enabled` (bool), `updated_by`, `updated_at`, `description`, `description_fr`.
- Seed inicial con los 8 módulos activos.
- RLS: `SELECT` para `authenticated` (todos pueden leer su disponibilidad), `UPDATE` solo `admin`.
- Hook `useModuleFlags()` para condicionar UI (esconder botones / nav items).

### 4. Layout consola
- `src/routes/_authenticated/admin/route.tsx` — pathless layout con sidebar (shadcn `Sidebar` con `collapsible="icon"`), gate `has_role('admin')`, redirige a `/dashboard` si no es admin.
- Hijos: `admin/users.tsx`, `admin/modules.tsx`, `admin/index.tsx` (resumen: # usuarios, # admins, módulos activos, últimas acciones).
- Diseño limpio, profesional, alineado con tokens existentes (no purple/indigo). Tipografía consistente con el resto.

### 5. Acceso
- Nuevo link **"Console"** visible solo cuando `has_role('admin') === true` en el dashboard y en el header.

## Detalles técnicos

- **Migración 015**: crea `module_flags` + GRANTs + RLS + seed + trigger `updated_at`.
- **Server fns**:
  - `src/lib/admin-users.functions.ts` — `listUsers`, `setUserRole`, `inviteUser`, `banUser`, `unbanUser`, `deleteUser`, `sendRecovery`.
  - `src/lib/admin-modules.functions.ts` — `listModules`, `toggleModule`.
  - Cada handler: `requireSupabaseAuth` → comprueba `has_role(ctx.userId,'admin')` → carga `supabaseAdmin` dinámicamente.
- **Middleware `requireModuleEnabled(name)`** reutilizable en agent server fns (writer, strategist, etc.) — devuelve 403 si flag off.
- **Sidebar**: provider montado solo dentro de `/admin/*` para no afectar el resto del app.
- **i18n**: claves nuevas `admin.*` en EN/FR.
- **Tests**: añadir cases en `src/evals/runner.test.ts` validando que un toggle off bloquea el flow correspondiente.
- **Evidence**: `docs/evidence/admin-console.md` con capturas + descripción de RBAC.

## Fuera de alcance
- Multi-tenant orgs reales (cada usuario sigue siendo su propio tenant — el toggle es global del proyecto, no por org).
- SSO/SCIM (out of scope, ya documentado en ADR).
- Audit log viewer rico (solo se escriben entradas; visor queda como follow-up).

```text
src/routes/
  _authenticated/
    admin/
      route.tsx        # layout + gate admin + Sidebar
      index.tsx        # resumen
      users.tsx        # tabla usuarios + acciones
      modules.tsx      # grid de toggles
src/lib/
  admin-users.functions.ts
  admin-modules.functions.ts
  module-gate.server.ts   # requireModuleEnabled middleware
src/components/admin/
  AdminSidebar.tsx
  UserRow.tsx
  InviteUserDialog.tsx
  ModuleCard.tsx
supabase/migrations/015_*.sql
docs/evidence/admin-console.md
```

## Iteraciones (High Autonomy)
1. Migración + seed `module_flags`.
2. Server fns admin (users + modules) con verificación de rol.
3. Layout `/admin` + sidebar + gate.
4. Página Usuarios completa.
5. Página Módulos completa + hook `useModuleFlags` + middleware `requireModuleEnabled`.
6. Integración: ocultar nav items + bloquear writer/strategist si módulo off.
7. i18n + evidencia + tests.

Ejecuto las 7 iteraciones seguidas y entrego el reporte final.
