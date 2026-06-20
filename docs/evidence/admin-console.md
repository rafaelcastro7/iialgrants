# Admin Console — Users & Modules

**Date:** 2026-06-20
**Migration:** `015_module_flags.sql`

## Scope

Professional administration console available at `/admin` for users with the
`admin` role. Layout uses a collapsible shadcn `Sidebar` with three sections:

| Path             | Purpose |
|------------------|---------|
| `/admin`         | Overview — totals, banned count, module status |
| `/admin/users`   | Full user management (roles, password reset, ban, delete, invite) |
| `/admin/modules` | Toggle 8 product modules on/off |

## RBAC layers

The console enforces admin role at three independent layers:

1. **Route gate** — `_authenticated/admin/route.tsx` `beforeLoad` queries
   `user_roles` for the current user; non-admins are redirected to
   `/dashboard`.
2. **Server function gate** — every admin server fn (`listAdminUsers`,
   `setUserAdminRole`, `inviteAdminUser`, `sendUserRecovery`,
   `setUserBanned`, `deleteUserHard`, `toggleModuleFlag`) calls
   `assertAdmin(context.userId)` before loading `supabaseAdmin`. An
   authenticated non-admin sees `Error: forbidden`.
3. **RLS** — `module_flags` policies restrict `UPDATE`/`INSERT` to
   `has_role(auth.uid(),'admin')`. Even if a server fn were bypassed, the
   database would reject the write.

## User management

| Action            | Backed by |
|-------------------|-----------|
| List users        | `auth.admin.listUsers` + join `user_roles` + `profiles` |
| Make/revoke admin | `user_roles` upsert/delete |
| Reset password    | `auth.resetPasswordForEmail` |
| Ban / unban       | `auth.admin.updateUserById({ ban_duration })` |
| Hard delete       | `auth.admin.deleteUser` (cascade via FKs) |
| Invite            | `auth.admin.inviteUserByEmail` + optional admin grant |

Self-protection: an admin cannot revoke their own admin role, ban
themselves, or delete themselves — server-side guards.

Every action writes an entry to `audit_log` (actor, action, resource_id).

## Module flags

Table `public.module_flags` seeds 8 modules:

| Module             | Effect when OFF |
|--------------------|-----------------|
| `grants_discovery` | Hides `/grants` nav link |
| `evaluator`        | `runEvaluator` server fn throws `module_disabled:evaluator` |
| `strategist`       | `runStrategist` server fn throws `module_disabled:strategist` |
| `writer`           | `draftSection` server fn throws `module_disabled:writer` |
| `critic`           | `runCritic` server fn throws `module_disabled:critic` |
| `submissions`      | Hides `/submissions` nav link |
| `rag_org_profile`  | (reserved — UI hook hides "Sync to RAG" CTA) |
| `public_webhooks`  | (reserved — toggle informational; enforce in webhook routes next iter) |

Server-side enforcement uses `assertModuleEnabled(name)` (defined in
`src/lib/admin-modules.functions.ts`) — it reads with `supabaseAdmin` and
throws when the flag is off, surfacing as a clear error to the caller.

## Verification

- Logged in as `demo-admin@iial.test` → Console button visible in dashboard.
- Logged in as `demo-member-a@iial.test` → Console button hidden;
  `/admin` direct hit redirects to `/dashboard`.
- Toggled `evaluator` OFF → `Evaluate fit` button in `/grants` raises
  `module_disabled:evaluator` (caught by existing error display).
- Toggled it back ON → flow resumes.

## Out of scope (follow-up)

- Per-org overrides (current scope is workspace-global).
- Bulk import of users (CSV).
- Audit log viewer UI (entries are written; visor is open).
