import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCrawlLedgerStats, getCrawlLedgerRecent,
  type CrawlLedgerStats, type CrawlLedgerRecent,
} from "@/lib/crawl-ledger.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.round(d / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function inFuture(iso: string): string {
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return "due now";
  const m = Math.round(d / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}

const STATUS_COLOR: Record<string, string> = {
  ok: "default", unchanged: "secondary", changed: "default",
  gone: "destructive", blocked: "destructive", error: "destructive",
  pending: "outline",
};

export function CrawlLedgerWidget() {
  const statsFn = useServerFn(getCrawlLedgerStats);
  const recentFn = useServerFn(getCrawlLedgerRecent);
  const stats = useQuery<CrawlLedgerStats>({ queryKey: ["crawl-ledger-stats"], queryFn: () => statsFn(), refetchInterval: 30_000 });
  const recent = useQuery<CrawlLedgerRecent[]>({ queryKey: ["crawl-ledger-recent"], queryFn: () => recentFn(), refetchInterval: 30_000 });

  const s = stats.data ?? { due_now: 0, queued_24h: 0, stable: 0, gone: 0, blocked: 0, errored: 0, total: 0 };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crawl ledger</CardTitle>
        <p className="text-sm text-muted-foreground">
          Adaptive re-crawl schedule (Nutch-style). URLs are skipped until <code>next_fetch_at</code> elapses.
          Stable pages stretch out to 14d; changing pages tighten to 6h.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-sm">
          <Stat label="Total tracked" value={s.total} />
          <Stat label="Due now"       value={s.due_now}    tone="warning" />
          <Stat label="Queued < 24h"  value={s.queued_24h} />
          <Stat label="Stable"        value={s.stable}     tone="ok" />
          <Stat label="Gone (404)"    value={s.gone}       tone="muted" />
          <Stat label="Blocked"       value={s.blocked}    tone="muted" />
          <Stat label="Errored"       value={s.errored}    tone="danger" />
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Last 50 fetches</div>
          <div className="border rounded-md divide-y max-h-80 overflow-auto">
            {(recent.data ?? []).map((r) => (
              <div key={r.url} className="px-3 py-2 text-xs flex items-center gap-2">
                <Badge variant={(STATUS_COLOR[r.status] as never) ?? "outline"}>{r.status}</Badge>
                <span className="text-muted-foreground w-16 shrink-0">{timeAgo(r.last_fetched_at)}</span>
                <span className="text-muted-foreground w-20 shrink-0">{inFuture(r.next_fetch_at)}</span>
                <span className="text-muted-foreground w-12 shrink-0">×{r.change_count}</span>
                <a href={r.url} target="_blank" rel="noreferrer" className="truncate hover:underline" title={r.url}>
                  {r.title || r.url}
                </a>
              </div>
            ))}
            {(recent.data?.length ?? 0) === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No URLs visited yet. Run discovery to populate the ledger.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warning" | "danger" | "muted" }) {
  const cls = tone === "ok" ? "text-emerald-600"
    : tone === "warning" ? "text-amber-600"
    : tone === "danger" ? "text-red-600"
    : tone === "muted" ? "text-muted-foreground"
    : "";
  return (
    <div className="border rounded-md p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}
