import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type ModuleFlag = {
  module: string;
  enabled: boolean;
  description: string;
  description_fr: string;
  updated_at: string;
  updated_by: string | null;
};

export const listModuleFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Any authenticated user can read; RLS allows it.
    const { data, error } = await context.supabase
      .from("module_flags")
      .select("module, enabled, description, description_fr, updated_at, updated_by")
      .order("module", { ascending: true });
    if (error) throw new Error(error.message);
    return { modules: (data ?? []) as ModuleFlag[] };
  });

export const toggleModuleFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ module: z.string().min(1), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("module_flags")
      .update({ enabled: data.enabled, updated_by: context.userId })
      .eq("module", data.module);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: data.enabled ? "module.enable" : "module.disable",
      resource_type: "module_flag",
      resource_id: data.module,
      metadata: {},
    } as never);
    return { ok: true };
  });

// Server-side check used by agent server fns to short-circuit when off.
export async function assertModuleEnabled(name: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("module_flags")
    .select("enabled")
    .eq("module", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.enabled) {
    throw new Error(`module_disabled:${name}`);
  }
}
