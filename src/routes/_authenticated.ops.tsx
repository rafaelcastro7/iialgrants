import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getOpsMetrics } from "@/lib/ops.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineAnalyticsCard } from "@/components/admin/PipelineAnalyticsCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

const opts = queryOptions({ queryKey: ["ops"], queryFn: () => getOpsMetrics() });

export const Route = createFileRoute("/_authenticated/ops")({
  head: () => ({ meta: [{ title: "Ops - IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: OpsPage,
  errorComponent: ({ error }) => (
    <main className="p-8 text-sm">
      <p className="font-medium text-destructive">{String(error?.message || error)}</p>
      <Link to="/dashboard" className="underline">
        Back to dashboard
      </Link>
    </main>
  ),
});

function OpsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fetchOps = useServerFn(getOpsMetrics);
  const { data } = useSuspenseQuery({ queryKey: ["ops"], queryFn: () => fetchOps() });

  useEffect(() => {
    syncClientLocale();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  const totalRuns = data.daily.reduce((s, d) => s + Number(d.runs), 0);
  const totalErr = data.daily.reduce((s, d) => s + Number(d.error_runs), 0);
  const totalCost = data.daily.reduce((s, d) => s + Number(d.cost_usd ?? 0), 0);
  const errPct = totalRuns ? ((totalErr / totalRuns) * 100).toFixed(1) : "0.0";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="font-semibold">
              {t("app.name")}
            </Link>
            <Link to="/ops" className="text-sm font-medium hover:underline">
              {t("ops.title")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={signOut}>
              {t("nav.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <h1 className="font-display text-4xl leading-none">{t("ops.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ops.subtitle")}</p>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={t("ops.runs30d")} value={String(totalRuns)} />
          <Stat label={t("ops.errorRate")} value={`${errPct}%`} />
          <Stat label={t("ops.cost30d")} value={`$${totalCost.toFixed(2)}`} />
          <Stat
            label={t("ops.pipeline")}
            value={String(Object.values(data.pipeline).reduce((a, b) => a + b, 0))}
          />
        </div>

        <PipelineAnalyticsCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ops.byAgent")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Day</th>
                  <th className="p-2 text-left">Agent</th>
                  <th className="p-2">Runs</th>
                  <th className="p-2">OK</th>
                  <th className="p-2">Err</th>
                  <th className="p-2">Degr</th>
                  <th className="p-2">In tok</th>
                  <th className="p-2">Out tok</th>
                  <th className="p-2">p50 ms</th>
                  <th className="p-2">p95 ms</th>
                  <th className="p-2">Cost $</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono text-xs">{String(d.day).slice(0, 10)}</td>
                    <td className="p-2">
                      <Badge variant="outline">{d.agent}</Badge>
                    </td>
                    <td className="p-2 text-right">{d.runs}</td>
                    <td className="p-2 text-right">{d.ok_runs}</td>
                    <td className="p-2 text-right text-destructive">{d.error_runs}</td>
                    <td className="p-2 text-right">{d.degraded_runs}</td>
                    <td className="p-2 text-right">{d.input_tokens}</td>
                    <td className="p-2 text-right">{d.output_tokens}</td>
                    <td className="p-2 text-right">{d.p50_ms ?? "-"}</td>
                    <td className="p-2 text-right">{d.p95_ms ?? "-"}</td>
                    <td className="p-2 text-right">{Number(d.cost_usd ?? 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ops.recent")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recent.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 border-b py-1 text-xs">
                <span className="font-mono">
                  {new Date(r.created_at as string).toLocaleString()}
                </span>
                <Badge variant="outline">{r.agent}</Badge>
                <Badge variant={r.status === "failed" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
                <span className="text-muted-foreground">{r.model}</span>
                {r.latency_ms != null && <span>{r.latency_ms} ms</span>}
                {r.error && (
                  <span className="max-w-md truncate text-destructive" title={r.error}>
                    {r.error}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
