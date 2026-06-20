import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAgentEvents } from "@/lib/grants.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, RefreshCw, Eye, EyeOff } from "lucide-react";

type RunRow = {
  id: string;
  run_id: string;
  agent: string;
  status: string;
  model: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  grant_id: string | null;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  degraded: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  running: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

function fmtTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventLog({ fr }: { fr: boolean }) {
  const [open, setOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchEvents = useServerFn(listAgentEvents);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["agent-events", agentFilter, statusFilter],
    queryFn: () => fetchEvents({
      data: {
        limit: 80,
        agent: agentFilter === "all" ? undefined : agentFilter,
        status: statusFilter === "all" ? undefined : (statusFilter as "succeeded" | "failed" | "degraded" | "running"),
      },
    }),
    enabled: open,
    refetchInterval: open && autoRefresh ? 5_000 : false,
    staleTime: 2_000,
  });

  const runs: RunRow[] = (data?.runs as RunRow[]) ?? [];
  const failed = runs.filter((r) => r.status === "failed").length;

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <section className="mt-8 border rounded-lg bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {fr ? "Journal d'événements" : "Event log"}
          {failed > 0 && open && (
            <Badge variant="destructive" className="ml-1">{failed} {fr ? "erreurs" : "errors"}</Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? (fr ? "Masquer" : "Hide") : (fr ? "Afficher" : "Show")}
        </span>
      </button>

      {open && (
        <div className="border-t">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30 text-xs">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="bg-background border rounded px-2 py-1"
            >
              <option value="all">{fr ? "Tous les agents" : "All agents"}</option>
              <option value="discoverer">discoverer</option>
              <option value="enricher">enricher</option>
              <option value="evaluator">evaluator</option>
              <option value="strategist">strategist</option>
              <option value="writer">writer</option>
              <option value="critic">critic</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border rounded px-2 py-1"
            >
              <option value="all">{fr ? "Tous les statuts" : "All statuses"}</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="degraded">degraded</option>
              <option value="running">running</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAutoRefresh((v) => !v)}
              className="h-7 px-2"
              title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
            >
              {autoRefresh ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span className="ml-1">{autoRefresh ? "5s" : "off"}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2" disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <span className="ml-auto text-muted-foreground">
              {runs.length} {fr ? "événements" : "events"}
            </span>
          </div>

          {error && (
            <p className="px-4 py-3 text-xs text-destructive">{error instanceof Error ? error.message : String(error)}</p>
          )}

          <div className="max-h-96 overflow-auto divide-y">
            {runs.length === 0 && !isFetching && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {fr ? "Aucun événement." : "No events yet."}
              </p>
            )}
            {runs.map((r) => {
              const isOpen = expanded.has(r.id);
              const meta = r.metadata as Record<string, unknown> | null;
              const funderName = meta && typeof meta.funder_name === "string" ? meta.funder_name : undefined;
              return (
                <div key={r.id} className="px-4 py-2 text-xs">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => toggleExpand(r.id)}
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="text-muted-foreground tabular-nums w-20">{fmtTime(r.created_at)}</span>
                    <Badge variant="outline" className={`${STATUS_COLOR[r.status] ?? ""} font-mono`}>{r.status}</Badge>
                    <span className="font-mono font-medium">{r.agent}</span>
                    {funderName && <span className="text-muted-foreground truncate">· {funderName}</span>}
                    {r.latency_ms != null && (
                      <span className="ml-auto text-muted-foreground tabular-nums">{r.latency_ms}ms</span>
                    )}
                  </button>
                  {r.error && !isOpen && (
                    <p className="ml-8 mt-1 text-destructive truncate">{r.error}</p>
                  )}
                  {isOpen && (
                    <div className="ml-8 mt-2 space-y-1 text-muted-foreground">
                      <div><span className="font-mono">run_id:</span> {r.run_id}</div>
                      {r.model && <div><span className="font-mono">model:</span> {r.model}</div>}
                      {(r.input_tokens != null || r.output_tokens != null) && (
                        <div>
                          <span className="font-mono">tokens:</span> in={r.input_tokens ?? "—"} / out={r.output_tokens ?? "—"}
                        </div>
                      )}
                      {r.error && (
                        <pre className="text-destructive whitespace-pre-wrap break-words bg-destructive/5 rounded p-2">{r.error}</pre>
                      )}
                      {meta && (
                        <pre className="whitespace-pre-wrap break-words bg-muted/40 rounded p-2 font-mono">{JSON.stringify(meta, null, 2)}</pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
