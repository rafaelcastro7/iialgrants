import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

export const getOpsMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [daily, recent, pipeline] = await Promise.all([
      supabaseAdmin
        .from("agent_runs_daily")
        .select("*")
        .limit(200),
      supabaseAdmin
        .from("agent_runs")
        .select("id, agent, status, model, latency_ms, input_tokens, output_tokens, cost_usd, error, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("grants")
        .select("status")
        .limit(2000),
    ]);
    if (daily.error) throw new Error(daily.error.message);
    if (recent.error) throw new Error(recent.error.message);
    if (pipeline.error) throw new Error(pipeline.error.message);

    const pipelineCounts: Record<string, number> = {};
    for (const g of pipeline.data ?? []) {
      pipelineCounts[g.status] = (pipelineCounts[g.status] ?? 0) + 1;
    }
    return {
      daily: daily.data ?? [],
      recent: recent.data ?? [],
      pipeline: pipelineCounts,
    };
  });
