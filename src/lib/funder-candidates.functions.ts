// Admin server functions for funder candidates: list, approve, reject, run-now.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export const listFunderCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; limit?: number } | undefined) =>
    z.object({
      status: z.enum(["pending_review", "approved", "rejected", "all"]).default("pending_review"),
      limit: z.number().min(1).max(200).default(50),
    }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("funder_candidates")
      .select("id,name,name_fr,bn_number,province,funder_type,website,source_signals,score,status,raw_metadata,discovered_at,reviewed_at,reject_reason")
      .order("score", { ascending: false }).limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const approveFunderCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin.from("funder_candidates")
      .select("name,name_fr,bn_number,province,website,raw_metadata")
      .eq("id", data.id).single();
    if (error || !c) throw new Error(error?.message ?? "not_found");
    const { error: fErr } = await supabaseAdmin.from("funders").insert({
      name: c.name as string, name_fr: c.name_fr as string | null,
      country: "CA", jurisdiction: c.province as string | null,
      website: c.website as string | null, source_url: c.website as string | null,
      source_type: "manual", bn_number: c.bn_number as string | null, active: true,
    });
    if (fErr && !/duplicate key/i.test(fErr.message)) throw new Error(fErr.message);
    await supabaseAdmin.from("funder_candidates").update({
      status: "approved", reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
    } as never).eq("id", data.id);
    return { ok: true };
  });

export const rejectFunderCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("funder_candidates").update({
      status: "rejected", reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(), reject_reason: data.reason ?? null,
    } as never).eq("id", data.id);
    return { ok: true };
  });

export const runSourceCuratorNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { runSourceCurator } = await import("@/lib/source-curator/orchestrator.server");
    return await runSourceCurator();
  });

export const listSourceIngestRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("source_ingest_runs")
      .select("id,dataset,rows_in,candidates_out,auto_approved,duplicates,errors,latency_ms,status,error_message,run_at")
      .order("run_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
