// Live chain-of-thought panel. Polls agent_trace_steps every 1s while the
// agent run is active and renders each step (scrape, regex, LLM, validation)
// in chronological order with status icon, message, payload, and duration.
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgentTrace } from "@/lib/traces.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2, Info, AlertTriangle, Play, Flag } from "lucide-react";

type Status = "info" | "ok" | "warn" | "error" | "start" | "done";

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok" || s === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />;
  if (s === "error") return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  if (s === "start") return <Play className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />;
  return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
}

export function AgentTracePanel({
  runId, agentLabel, open, onOpenChange, fr,
}: {
  runId: string | null;
  agentLabel: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fr: boolean;
}) {
  const fetchTrace = useServerFn(getAgentTrace);
  const { data } = useQuery({
    queryKey: ["agent-trace", runId],
    queryFn: () => (runId ? fetchTrace({ data: { runId } }) : Promise.resolve({ steps: [] })),
    enabled: !!runId && open,
    refetchInterval: (q) => {
      const steps = q.state.data?.steps ?? [];
      const last = steps[steps.length - 1];
      if (last && (last.status === "done" || last.status === "error") && (last.step === "commit" || last.step === "done")) return false;
      return 1000;
    },
    staleTime: 500,
  });

  const steps = (data?.steps ?? []) as Array<{
    id: string; step: string; status: string; message: string | null;
    payload: string | null; duration_ms: number | null; created_at: string;
  }>;

  const t0Ms = useMemo(() => (steps[0] ? new Date(steps[0].created_at).getTime() : 0), [steps]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [steps.length]);

  const lastStatus = steps[steps.length - 1]?.status;
  const running = !!runId && lastStatus !== "done" && lastStatus !== "error";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin text-sky-500" /> : <Flag className="h-4 w-4 text-emerald-500" />}
            {fr ? "Chaîne de raisonnement —" : "Chain of thought —"} <span className="font-mono text-sm">{agentLabel}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {runId ? <span className="font-mono">run {runId.slice(0, 12)}…</span> : (fr ? "Aucune corrida sélectionnée" : "No run selected")}
            {steps.length > 0 && <span className="ml-2">· {steps.length} {fr ? "étapes" : "steps"}</span>}
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto mt-3 pr-2 space-y-1.5">
          {!runId && (
            <p className="text-xs text-muted-foreground italic py-8 text-center">
              {fr ? "Lancez Enrich ou Évaluer pour voir le raisonnement en direct." : "Trigger Enrich or Evaluate to see live reasoning."}
            </p>
          )}
          {runId && steps.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-8 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {fr ? "En attente du premier événement…" : "Waiting for first event…"}
            </p>
          )}
          {steps.map((s, i) => {
            const tDelta = t0Ms ? new Date(s.created_at).getTime() - t0Ms : 0;
            let payloadObj: Record<string, unknown> | null = null;
            if (s.payload) { try { payloadObj = JSON.parse(s.payload) as Record<string, unknown>; } catch { /* ignore */ } }
            return (
              <div key={s.id} className="border rounded-md p-2 bg-card text-xs">
                <div className="flex items-start gap-2">
                  <StatusIcon s={s.status as Status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-muted-foreground tabular-nums shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">{s.step}</Badge>
                      <span className="text-muted-foreground tabular-nums text-[10px]">+{(tDelta / 1000).toFixed(2)}s</span>
                      {s.duration_ms != null && (
                        <span className="text-muted-foreground tabular-nums text-[10px]">({s.duration_ms}ms)</span>
                      )}
                    </div>
                    {s.message && <p className="mt-1 leading-relaxed break-words">{s.message}</p>}
                    {payloadObj && Object.keys(payloadObj).length > 0 && (
                      <details className="mt-1.5">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                          {fr ? "Détails" : "Details"}
                        </summary>
                        <pre className="mt-1 text-[10px] bg-muted/40 p-1.5 rounded font-mono overflow-x-auto whitespace-pre-wrap break-words">
{JSON.stringify(payloadObj, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
