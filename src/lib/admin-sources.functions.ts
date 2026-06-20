// Admin Source Console — list registry, run a specific tier, toggle a source.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: ReturnType<typeof requireSupabaseAuth> extends never ? never : Awaited<ReturnType<NonNullable<unknown>>>, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export const listDiscoverySources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: sources, error } = await context.supabase
      .from("discovery_sources_registry")
      .select("*")
      .order("tier")
      .order("dataset_key");
    if (error) throw error;
    const { data: health } = await context.supabase
      .from("source_health_summary")
      .select("*");
    return { sources: sources ?? [], health: health ?? [] };
  });

export const setSourceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ datasetKey: z.string().min(1), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("discovery_sources_registry")
      .update({ enabled: data.enabled })
      .eq("dataset_key", data.datasetKey);
    if (error) throw error;
    return { ok: true };
  });

export const runDiscoveryTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tier: z.enum(["A","B","C","scout","all"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runSourceCurator } = await import("@/lib/source-curator/orchestrator.server");
    const result = await runSourceCurator(data.tier);
    return result;
  });

export const promoteStaleCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("auto_promote_stale_candidates");
    if (error) throw error;
    return { promoted: data ?? [] };
  });

export const recentSourceRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("source_ingest_runs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return data ?? [];
  });
