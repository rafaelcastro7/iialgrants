import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getSubmissionOutcomes,
  getAwardMetrics,
  getReportingDeadlines,
} from "@/lib/post-award.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { Trophy, TrendingUp, AlertTriangle, Calendar, DollarSign } from "lucide-react";

const metricsQO = queryOptions({
  queryKey: ["post-award", "metrics"],
  queryFn: () => getAwardMetrics({ data: { period: "all" } }),
});

const outcomesQO = queryOptions({
  queryKey: ["post-award", "outcomes"],
  queryFn: () => getSubmissionOutcomes({ data: { limit: 50 } }),
});

const deadlinesQO = queryOptions({
  queryKey: ["post-award", "deadlines"],
  queryFn: () => getReportingDeadlines({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/post-award")({
  head: () => ({ meta: [{ title: "Post-Award — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(metricsQO);
    await context.queryClient.ensureQueryData(outcomesQO);
    await context.queryClient.ensureQueryData(deadlinesQO);
  },
  component: PostAwardPage,
});

function PostAwardPage() {
  const fetchMetrics = useServerFn(getAwardMetrics);
  const { data: metrics } = useSuspenseQuery({
    queryKey: ["post-award", "metrics"],
    queryFn: () => fetchMetrics({ data: { period: "all" } }),
  });

  const fetchOutcomes = useServerFn(getSubmissionOutcomes);
  const { data: outcomes } = useSuspenseQuery({
    queryKey: ["post-award", "outcomes"],
    queryFn: () => fetchOutcomes({ data: { limit: 50 } }),
  });

  const fetchDeadlines = useServerFn(getReportingDeadlines);
  const { data: deadlines } = useSuspenseQuery({
    queryKey: ["post-award", "deadlines"],
    queryFn: () => fetchDeadlines({ data: {} }),
  });

  const resultColor = (r: string) =>
    r === "won" ? "text-emerald-600" : r === "lost" ? "text-red-600" : "text-muted-foreground";

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Post-Award Tracker" />

        <PageContainer size="wide">
          <PageHeader
            eyebrow="Post-award"
            title="Post-Award Tracker"
            description="Outcomes, win rates, and reporting deadlines."
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Trophy className="h-4 w-4" />
                  <p className="text-xs">Total Outcomes</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Win Rate</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.winRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <p className="text-xs">Total Awarded</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  ${metrics.totalAwarded.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <p className="text-xs">Avg Award</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">${metrics.avgAward.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4" />
                  Results Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Won", count: metrics.won, color: "bg-emerald-500" },
                  { label: "Lost", count: metrics.lost, color: "bg-red-500" },
                  { label: "Pending", count: metrics.pending, color: "bg-amber-500" },
                  { label: "Withdrawn", count: metrics.withdrawn, color: "bg-gray-400" },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${r.color}`} />
                      <span className="text-sm">{r.label}</span>
                    </div>
                    <span className="text-sm font-medium">{r.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4" />
                  Reporting Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {deadlines.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No active awards yet.
                  </p>
                )}
                {deadlines.slice(0, 5).map((d) => (
                  <div key={d.outcomeId} className="border-b pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{d.grantTitle}</span>
                      <span className="text-sm text-muted-foreground">
                        ${d.amountAwarded?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-2">
                      {d.reportingRequirements.map((r) => (
                        <Badge key={r.type} variant="outline" className="text-[10px]">
                          {r.type.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {outcomes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Grant</th>
                        <th className="pb-2 font-medium">Proposal</th>
                        <th className="pb-2 font-medium">Decision</th>
                        <th className="pb-2 font-medium text-right">Amount</th>
                        <th className="pb-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outcomes.slice(0, 10).map((o) => {
                        const s = Array.isArray(o.submission) ? o.submission[0] : o.submission;
                        const g = Array.isArray(s?.grant) ? s?.grant[0] : s?.grant;
                        const p = Array.isArray(s?.proposal) ? s?.proposal[0] : s?.proposal;
                        return (
                          <tr key={o.id} className="border-b last:border-0">
                            <td className="py-2">{g?.title ?? "—"}</td>
                            <td className="py-2">{p?.title ?? "—"}</td>
                            <td className="py-2">
                              <span className={`font-medium capitalize ${resultColor(o.result)}`}>
                                {o.result?.replace("_", " ") ?? "—"}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              ${o.amount_awarded_cad?.toLocaleString() ?? "—"}
                            </td>
                            <td className="py-2 text-muted-foreground">{o.decision_date ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </PageContainer>
      </div>
    </PageTransition>
  );
}
