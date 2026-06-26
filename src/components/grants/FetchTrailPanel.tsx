// Lived audit trail of which fetch engines ran for the current grant.
// Polls every 4 s while open so the user sees engines populate in real time.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFetchTrail, type FetchAttemptRow } from "@/lib/grant-self-check.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";

const ENGINE_LABEL: Record<string, string> = {
  scrape_engine: "Local engine (Readability)",
  jina_reader: "Jina Reader (free)",
  raw_html: "Raw HTML (Chrome UA)",
  raw_html_googlebot: "Raw HTML (Googlebot UA)",
  wayback: "Wayback Machine",
  archive_today: "archive.today",
  firecrawl: "Firecrawl",
  firecrawl_json: "Firecrawl JSON",
};

export function FetchTrailPanel({
  grantId,
  onRetry,
  retrying,
  errorMsg,
}: {
  grantId: string;
  onRetry?: () => void;
  retrying?: boolean;
  errorMsg?: string | null;
}) {
  const getTrail = useServerFn(getFetchTrail);
  const [open, setOpen] = useState(true);
  const { data, refetch } = useQuery({
    queryKey: ["fetch-trail", grantId],
    queryFn: () => getTrail({ data: { grantId } }),
    refetchInterval: retrying ? 3_000 : 15_000,
    refetchOnWindowFocus: true,
  });

  const attempts: FetchAttemptRow[] = data?.attempts ?? [];
  const failed = data?.status === "failed";
  const lastTs = attempts[attempts.length - 1]?.ts;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-left">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Fetch trail
            {attempts.length > 0 && (
              <Badge variant={failed ? "destructive" : "secondary"} className="ml-2">
                {attempts.length} engine{attempts.length === 1 ? "" : "s"}
              </Badge>
            )}
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => refetch()} title="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry fetch"}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {errorMsg && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              <div className="font-medium text-destructive mb-1">Last error</div>
              <div className="font-mono text-[11px] break-all">{errorMsg}</div>
              {data?.nextRetryAfter && (
                <div className="mt-1.5 text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Auto-retry recommended after {new Date(data.nextRetryAfter).toLocaleString()}
                </div>
              )}
            </div>
          )}
          {attempts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No fetch attempts recorded yet. Trigger one with <b>Fetch details</b> above.</p>
          ) : (
            <div className="space-y-1.5">
              {attempts.map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded border px-2 py-1.5 text-xs">
                  {a.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{ENGINE_LABEL[a.engine] ?? a.engine}</div>
                    <div className="text-muted-foreground tabular-nums">
                      {a.http_status ? `HTTP ${a.http_status} · ` : ""}
                      {a.latency_ms}ms
                      {a.bytes ? ` · ${a.bytes.toLocaleString()} chars` : ""}
                      {" · "}
                      {a.ts ? new Date(a.ts).toLocaleTimeString() : ""}
                    </div>
                    {a.error && <div className="font-mono text-[10px] text-destructive break-all">{a.error}</div>}
                    {a.url_used && a.url_used !== grantId && (
                      <div className="font-mono text-[10px] text-muted-foreground truncate">→ {a.url_used}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {data?.runId && (
            <div className="text-[10px] text-muted-foreground font-mono">
              run {data.runId.slice(0, 8)} · {data.totalLatencyMs}ms total · {lastTs && new Date(lastTs).toLocaleString()}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
