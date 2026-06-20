import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
  preferred_lang: "en" | "fr" | null;
  org_name: string | null;
};

type AuditInsert = {
  user_id: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

async function audit(entry: AuditInsert) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // service_role bypasses RLS; generated types omit the locked INSERT — cast.
  await supabaseAdmin.from("audit_log").insert(entry as never);
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);

    const ids = users.users.map((u) => u.id);
    const [rolesResp, profilesResp] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, preferred_lang, org_name").in("id", ids),
    ]);
    const roles = rolesResp.data ?? [];
    const profiles = profilesResp.data ?? [];
    const adminSet = new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const rows: AdminUserRow[] = users.users.map((u) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until: (u as { banned_until?: string | null }).banned_until ?? null,
        is_admin: adminSet.has(u.id),
        preferred_lang: (p?.preferred_lang as "en" | "fr" | undefined) ?? null,
        org_name: p?.org_name ?? null,
      };
    });
    rows.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return { users: rows };
  });

export const setUserAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && !data.admin) {
      throw new Error("You cannot remove your own admin role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.admin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    await audit({
      user_id: context.userId,
      action: data.admin ? "role.grant_admin" : "role.revoke_admin",
      resource_type: "user",
      resource_id: data.userId,
    });
    return { ok: true };
  });

export const inviteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ email: z.string().email(), asAdmin: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    if (error) throw new Error(error.message);
    if (data.asAdmin && invited.user) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: invited.user.id, role: "admin" }, { onConflict: "user_id,role" });
    }
    await audit({
      user_id: context.userId,
      action: "user.invite",
      resource_type: "user",
      resource_id: invited.user?.id ?? null,
      metadata: { email: data.email, as_admin: data.asAdmin },
    });
    return { ok: true, userId: invited.user?.id ?? null };
  });

export const sendUserRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ email: z.string().email() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email);
    if (error) throw new Error(error.message);
    await audit({
      user_id: context.userId,
      action: "user.recovery_sent",
      resource_type: "user",
      metadata: { email: data.email },
    });
    return { ok: true };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot ban yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ban_duration = data.banned ? "876000h" : "none";
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { ban_duration } as { ban_duration: string },
    );
    if (error) throw new Error(error.message);
    await audit({
      user_id: context.userId,
      action: data.banned ? "user.ban" : "user.unban",
      resource_type: "user",
      resource_id: data.userId,
    });
    return { ok: true };
  });

export const deleteUserHard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await audit({
      user_id: context.userId,
      action: "user.delete",
      resource_type: "user",
      resource_id: data.userId,
    });
    return { ok: true };
  });
