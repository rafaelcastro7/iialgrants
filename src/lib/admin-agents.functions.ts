import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type AgentFlag = {
  agent: string;
  enabled: boolean;
  description: string;
  description_fr: string;
  updated_at: string;
  updated_by: string | null;
};

export const listAgentFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_flags" as never)
      .select("agent, enabled, description, description_fr, updated_at, updated_by")
      .order("agent", { ascending: true });
    if (error) throw new Error(error.message);
    return { agents: (data ?? []) as unknown as AgentFlag[] };
  });

export const toggleAgentFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agent: z.string().min(1), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agent_flags" as never)
      .update({ enabled: data.enabled, updated_by: context.userId } as never)
      .eq("agent", data.agent);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: data.enabled ? "agent.enable" : "agent.disable",
      resource_type: "agent_flag",
      resource_id: data.agent,
      metadata: {},
    } as never);
    return { ok: true };
  });

// Server-side check used by agent server fns to short-circuit when off.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase query builder is intentional here
export async function assertAgentEnabled(name: string, db?: { from: (table: string) => any }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = db ?? supabaseAdmin;
  const { data, error } = await client
    .from("agent_flags" as never)
    .select("enabled")
    .eq("agent", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { enabled?: boolean } | null;
  if (!row || !row.enabled) {
    throw new Error(`agent_disabled:${name}`);
  }
}
