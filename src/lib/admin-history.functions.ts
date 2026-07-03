import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

// Admin-only discovery history: funders, recent discovery sources, and the last
// discoverer agent runs. Kept in a .functions module (not the route file) so the
// route only exports its component (React Fast Refresh requirement).
export const listDiscoveryHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [funders, sources, runs] = await Promise.all([
      supabaseAdmin
        .from("funders")
        .select("id, name, jurisdiction, source_url, active, last_discovered_at")
        .order("name"),
      supabaseAdmin
        .from("discovery_sources" as never)
        .select(
          "funder_id, url, http_status, text_length, grants_found, grants_inserted, times_seen, first_seen_at, last_fetched_at",
        )
        .order("last_fetched_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("agent_runs")
        .select("run_id, agent, status, latency_ms, metadata, created_at")
        .eq("agent", "discoverer")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      funders: funders.data ?? [],
      sources: (sources.data ?? []) as unknown as Array<{
        funder_id: string;
        url: string;
        http_status: number | null;
        text_length: number | null;
        grants_found: number;
        grants_inserted: number;
        times_seen: number;
        first_seen_at: string;
        last_fetched_at: string;
      }>,
      runs: runs.data ?? [],
    };
  });
