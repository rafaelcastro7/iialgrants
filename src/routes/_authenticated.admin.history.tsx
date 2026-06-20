import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const listDiscoveryHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [funders, sources, runs] = await Promise.all([
      supabaseAdmin.from("funders").select("id, name, jurisdiction, source_url, active, last_discovered_at").order("name"),
      supabaseAdmin.from("discovery_sources" as never).select("funder_id, url, http_status, text_length, grants_found, grants_inserted, times_seen, first_seen_at, last_fetched_at").order("last_fetched_at", { ascending: false }).limit(50),
      supabaseAdmin.from("agent_runs").select("run_id, agent, status, latency_ms, metadata, created_at").eq("agent", "discoverer").order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      funders: funders.data ?? [],
      sources: (sources.data ?? []) as unknown as Array<{
        funder_id: string; url: string; http_status: number | null; text_length: number | null;
        grants_found: number; grants_inserted: number; times_seen: number;
        first_seen_at: string; last_fetched_at: string;
      }>,
      runs: runs.data ?? [],
    };
  });

const qo = queryOptions({ queryKey: ["admin", "history"], queryFn: () => listDiscoveryHistory() });

export const Route = createFileRoute("/_authenticated/admin/history")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => <p className="text-sm text-destructive">Failed: {error.message}</p>,
  component: HistoryPage,
});

function HistoryPage() {
  const fetchHistory = useServerFn(listDiscoveryHistory);
  const { data } = useSuspenseQuery({ queryKey: ["admin", "history"], queryFn: () => fetchHistory() });
  const funderById = new Map(data.funders.map((f) => [f.id, f]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discovery History</h1>
        <p className="text-sm text-muted-foreground">
          Cached sources and entities the Discoverer reuses across runs.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Funders ({data.funders.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {data.funders.map((f) => (
            <div key={f.id} className="flex items-center justify-between border-b pb-2 last:border-0">
              <div>
                <div className="font-medium">{f.name} <span className="text-xs text-muted-foreground">· {f.jurisdiction ?? "—"}</span></div>
                <div className="text-xs text-muted-foreground truncate max-w-md">{f.source_url ?? "no source url"}</div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                <Badge variant={f.active ? "default" : "secondary"}>{f.active ? "active" : "inactive"}</Badge>
                <div>last: {f.last_discovered_at ? new Date(f.last_discovered_at).toLocaleString() : "never"}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Cached sources ({data.sources.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {data.sources.length === 0 && <p className="text-muted-foreground">No fetches yet — run Discover & Enrich.</p>}
          {data.sources.map((s) => (
            <div key={s.funder_id + s.url} className="flex items-center justify-between border-b pb-2 last:border-0 gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{funderById.get(s.funder_id)?.name ?? s.funder_id}</div>
                <div className="text-xs text-muted-foreground truncate">{s.url}</div>
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0">
                <div>HTTP {s.http_status ?? "—"} · {s.text_length ?? 0} chars</div>
                <div>{s.grants_inserted}/{s.grants_found} new · seen ×{s.times_seen}</div>
                <div>{new Date(s.last_fetched_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Discoverer runs</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {data.runs.length === 0 && <p className="text-muted-foreground">No runs recorded.</p>}
          {data.runs.map((r) => {
            const meta = (r.metadata ?? {}) as Record<string, unknown>;
            return (
              <div key={r.run_id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <Badge variant={r.status === "succeeded" ? "default" : r.status === "degraded" ? "secondary" : "destructive"}>
                    {r.status}
                  </Badge>{" "}
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {meta.cached ? <>cached ({String(meta.reason ?? "—")})</> : <>found {String(meta.found ?? 0)} · inserted {String(meta.inserted ?? 0)} · seen again {String(meta.seen_again ?? 0)}</>}
                  <div>{r.latency_ms}ms</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
