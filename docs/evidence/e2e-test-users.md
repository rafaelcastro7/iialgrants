# E2E Test Users — autologin (2026-06-20)

Generados con `scripts/e2e-seed.mjs` (service role, vía Lovable Cloud).
Los magic links abren sesión directamente en `https://text-teller-ace.lovable.app/dashboard` y expiran ~1h tras emisión.

| Rol | Email | UID | Magic link |
|---|---|---|---|
| Admin (tenant A) | e2e-admin-1781920468069@iial.test | 89a6bc3a-9e4e-405b-b244-ccaa716775ef | [autologin](https://dhsvnebywafdrdehgfou.supabase.co/auth/v1/verify?token=8ca1c4a2dcf2f5a18d36397162c9fe6a31e25c8560abda6391469199&type=magiclink&redirect_to=https://text-teller-ace.lovable.app/dashboard) |
| Member tenant A | e2e-member-a-1781920468069@iial.test | 853bd60d-4167-410f-a36e-1df99ecd2808 | [autologin](https://dhsvnebywafdrdehgfou.supabase.co/auth/v1/verify?token=8f08a327a09c0fb87efa8ebd29836b38a0555e261e515af4ea718994&type=magiclink&redirect_to=https://text-teller-ace.lovable.app/dashboard) |
| Member tenant B | e2e-member-b-1781920468069@iial.test | f75dcf1f-7066-481e-bbb2-38c9319c494d | [autologin](https://dhsvnebywafdrdehgfou.supabase.co/auth/v1/verify?token=201d5d5f4b72c52a1257de8fb2ac889135fc53f3e5d82d923d92f35c&type=magiclink&redirect_to=https://text-teller-ace.lovable.app/dashboard) |

## Verificación
- Magic link admin probado: `HTTP 303` → `/dashboard#access_token=eyJ…` ✅
- `handle_new_user` trigger insertó profile + rol `member` por defecto.
- Admin promocionado vía `INSERT INTO public.user_roles(role='admin')`.

## Re-emitir
```bash
node scripts/e2e-seed.mjs
```

## Limpieza (cuando termine la prueba)
Borrar los 3 UIDs vía Auth Admin API o `auth.admin.deleteUser(uid)`; el `ON DELETE CASCADE` limpia profiles, user_roles y datos derivados.

## Issue #3 (pen-test)
Con dos cuentas miembro (tenant A vs tenant B) ya es posible cubrir los
tests deferidos: cross-tenant RLS sobre `proposals`/`grants`/`submissions`,
DSAR scope y prompt-injection en pipeline real.
