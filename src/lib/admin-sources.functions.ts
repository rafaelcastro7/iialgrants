// Admin Source Console — list registry, run a specific tier, toggle a source.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export const listDiscoverySources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: sources, error } = await context.supabase
      .from("discovery_sources_registry")
      .select("*")
      .order("tier")
      .order("dataset_key");
    if (error) throw error;
    const { data: health } = await context.supabase.from("source_health_summary").select("*");
    return { sources: sources ?? [], health: health ?? [] };
  });

export const setSourceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ datasetKey: z.string().min(1), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await context.supabase
      .from("discovery_sources_registry")
      .update({ enabled: data.enabled })
      .eq("dataset_key", data.datasetKey);
    if (error) throw error;
    return { ok: true };
  });

export const runDiscoveryTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tier: z.enum(["A", "B", "C", "scout", "all"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { runSourceCurator } = await import("@/lib/source-curator/orchestrator.server");
    const result = await runSourceCurator(data.tier);
    return result;
  });

export const promoteStaleCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("auto_promote_stale_candidates");
    if (error) throw error;
    return { promoted: data ?? [] };
  });

export const recentSourceRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await context.supabase
      .from("source_ingest_runs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return data ?? [];
  });

// Funder pages that gated content behind a login/registration wall during
// discovery. Never auto-registered — this is a visibility queue for a human
// to sign up manually and then mark resolved.
export const listRegistrationGates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await context.supabase
      .from("discovery_registration_gates")
      .select("*, funders(name)")
      .order("status", { ascending: true })
      .order("last_detected_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const resolveRegistrationGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["registered", "not_needed", "pending"]),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await context.supabase
      .from("discovery_registration_gates")
      .update({
        status: data.status,
        resolved_at: data.status === "pending" ? null : new Date().toISOString(),
        resolved_note: data.note ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
