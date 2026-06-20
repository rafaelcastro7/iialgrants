import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDiscoveryJobStatus } from "@/lib/grants.functions";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, Loader2, Clock, X } from "lucide-react";

type FunderState = {
  funder_id: string;
  funder_name: string;
  status: "queued" | "running" | "succeeded" | "failed" | "degraded";
  attempts: number;
  inserted: number;
  seenAgain: number;
  engine?: string;
  lastError?: string;
  latency_ms?: number;
};

function StatusIcon({ s }: { s: FunderState["status"] }) {
  if (s === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (s === "running" || s === "degraded") return <Loader2 className="h-3.5 w-3.5 text-sky-500 animate-spin" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function DiscoveryProgress({
  jobId, queued, fr, onClose,
}: { jobId: string; queued: number; fr: boolean; onClose: () => void }) {
  const fetchStatus = useServerFn(getDiscoveryJobStatus);
  const { data, error } = useQuery({
    queryKey: ["discovery-job", jobId],
    queryFn: () => fetchStatus({ data: { jobId } }),
    refetchInterval: (q) => (q.state.data?.status === "completed" ? false : 3_000),
    staleTime: 1_000,
  });

  const status = data?.status ?? "queued";
  const perFunder = (data?.perFunder ?? []) as FunderState[];
  const processed = perFunder.filter((f) => f.status === "succeeded" || f.status === "failed").length;
  const total = data?.fundersQueued || queued || perFunder.length || 1;
  const pct = Math.round((processed / total) * 100);

  return (
    <section className="mb-4 border rounded-lg bg-card overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={status === "completed" ? "default" : "secondary"} className="font-mono">{status}</Badge>
          <span className="font-medium">{fr ? "Découverte" : "Discovery"}</span>
          <span className="text-muted-foreground text-xs">
            {processed}/{total} {fr ? "fournisseurs" : "funders"}
            {data ? ` · +${data.totalInserted} ${fr ? "nouvelles" : "new"} · ${data.totalSeenAgain} ${fr ? "revues" : "repeats"}` : ""}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="px-4 py-2">
        <Progress value={pct} className="h-1.5" />
      </div>
      {error && (
        <p className="px-4 py-2 text-xs text-destructive">{error instanceof Error ? error.message : String(error)}</p>
      )}
      <ul className="divide-y max-h-64 overflow-auto">
        {perFunder.length === 0 && (
          <li className="px-4 py-3 text-xs text-muted-foreground">
            {fr ? "En attente du démarrage…" : "Waiting for job to start…"}
          </li>
        )}
        {perFunder.map((f) => (
          <li key={f.funder_id} className="flex items-center gap-2 px-4 py-2 text-xs">
            <StatusIcon s={f.status} />
            <span className="font-medium truncate flex-1">{f.funder_name}</span>
            {f.attempts > 1 && (
              <Badge variant="outline" className="text-[10px] h-5">{fr ? "essai" : "attempt"} {f.attempts}</Badge>
            )}
            {f.engine && <span className="text-muted-foreground font-mono">[{f.engine}]</span>}
            <span className="text-muted-foreground tabular-nums">
              +{f.inserted}{f.seenAgain ? ` (${f.seenAgain} ${fr ? "revues" : "rep"})` : ""}
            </span>
            {f.latency_ms != null && (
              <span className="text-muted-foreground tabular-nums w-14 text-right">{f.latency_ms}ms</span>
            )}
            {f.status === "failed" && f.lastError && (
              <span className="text-destructive truncate max-w-[40%]" title={f.lastError}>· {f.lastError}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
