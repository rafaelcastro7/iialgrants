import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDiscoverySources, setSourceEnabled, runDiscoveryTier,
  promoteStaleCandidates, recentSourceRuns,
} from "@/lib/admin-sources.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/sources")({
  component: SourcesPage,
});

const TIER_LABEL: Record<string, string> = {
  A_daily: "Tier A · Daily",
  B_weekly: "Tier B · Weekly",
  C_monthly: "Tier C · Monthly",
  scout: "Scout (web-wide)",
};

type SourceRow = {
  id: string;
  dataset_key: string;
  label: string;
  tier: string;
  format: string;
  source_url: string | null;
  cadence_cron: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  notes: string | null;
};

type HealthRow = {
  dataset: string | null;
  runs: number | null;
  success_rate: number | null;
  rows_in_total: number | null;
  candidates_total: number | null;
  auto_approved_total: number | null;
  errors_total: number | null;
  avg_latency_ms: number | null;
  last_run_at: string | null;
};

type RunRow = {
  id: string;
  dataset: string;
  status: string;
  rows_in: number | null;
  candidates_out: number | null;
  auto_approved: number | null;
  errors: number | null;
  latency_ms: number | null;
  error_message: string | null;
  run_at: string;
};

function SourcesPage() {
  const listFn = useServerFn(listDiscoverySources);
  const toggleFn = useServerFn(setSourceEnabled);
  const runFn = useServerFn(runDiscoveryTier);
  const promoteFn = useServerFn(promoteStaleCandidates);
  const runsFn = useServerFn(recentSourceRuns);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-discovery-sources"],
    queryFn: () => listFn(),
  });
  const qRuns = useQuery({
    queryKey: ["admin-source-runs"],
    queryFn: () => runsFn(),
  });

  const sources: SourceRow[] = q.data?.sources ?? [];
  const health: HealthRow[] = q.data?.health ?? [];
  const healthMap = new Map(health.map((h) => [h.dataset ?? "", h]));

  const byTier = sources.reduce<Record<string, SourceRow[]>>((acc, s) => {
    (acc[s.tier] ??= []).push(s); return acc;
  }, {});

  async function runTier(tier: "A" | "B" | "C" | "scout" | "all") {
    setBusy(`tier:${tier}`);
    try {
      const r = await runFn({ data: { tier } });
      toast.success(`Tier ${tier}: ${r.totals.new} new candidates, ${r.totals.auto} auto-approved`);
      q.refetch(); qRuns.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function toggle(datasetKey: string, enabled: boolean) {
    setBusy(`toggle:${datasetKey}`);
    try {
      await toggleFn({ data: { datasetKey, enabled } });
      q.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function promote() {
    setBusy("promote");
    try {
      const r = await promoteFn();
      toast.success(`Promoted ${r.promoted.length} candidates`);
      qRuns.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discovery Sources</h1>
          <p className="text-sm text-muted-foreground">
            Self-growing catalog of grant funders. {sources.length} sources registered ·{" "}
            {sources.filter((s) => s.enabled).length} enabled.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runTier("A")} disabled={busy !== null}>Run Tier A</Button>
          <Button variant="outline" onClick={() => runTier("B")} disabled={busy !== null}>Run Tier B</Button>
          <Button variant="outline" onClick={() => runTier("C")} disabled={busy !== null}>Run Tier C</Button>
          <Button variant="outline" onClick={() => runTier("scout")} disabled={busy !== null}>Run Scout</Button>
          <Button onClick={() => runTier("all")} disabled={busy !== null}>Run ALL</Button>
          <Button variant="secondary" onClick={promote} disabled={busy !== null}>Promote stale</Button>
          <Link to="/admin/candidates"><Button variant="ghost">View candidates →</Button></Link>
        </div>
      </div>

      {Object.keys(TIER_LABEL).map((tier) => {
        const rows = byTier[tier] ?? [];
        if (!rows.length) return null;
        return (
          <Card key={tier}>
            <CardHeader><CardTitle className="text-base">{TIER_LABEL[tier]}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>30-day yield</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => {
                    const h = healthMap.get(s.dataset_key);
                    const successRate = h?.success_rate;
                    const statusVariant: "default" | "secondary" | "destructive" =
                      s.last_status === "succeeded" ? "default" :
                      s.last_status === "failed" ? "destructive" : "secondary";
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.label}</div>
                          <div className="text-xs text-muted-foreground">{s.dataset_key}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{s.format}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "—"}
                          {s.last_error && (
                            <div className="text-destructive max-w-xs truncate" title={s.last_error}>
                              {s.last_error}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {h ? (
                            <>
                              {h.candidates_total ?? 0} cand · {h.auto_approved_total ?? 0} auto
                              {successRate != null && (
                                <div className="text-muted-foreground">
                                  {Math.round(successRate * 100)}% ok · {h.errors_total ?? 0} err
                                </div>
                              )}
                            </>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant}>{s.last_status ?? "never run"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={s.enabled}
                            disabled={busy !== null}
                            onCheckedChange={(v) => toggle(s.dataset_key, v)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rows / cand / auto / err</TableHead>
                <TableHead>Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(qRuns.data ?? []).map((r: RunRow) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.run_at).toLocaleString()}</TableCell>
                  <TableCell>{r.dataset}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "succeeded" ? "default" : "destructive"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.rows_in ?? 0} / {r.candidates_out ?? 0} / {r.auto_approved ?? 0} / {r.errors ?? 0}
                  </TableCell>
                  <TableCell className="text-xs">{r.latency_ms ?? 0} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
