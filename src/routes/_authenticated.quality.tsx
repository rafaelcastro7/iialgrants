import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getProposalQualityMetrics, getQualityTrends } from "@/lib/proposal-quality.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { BarChart3, TrendingUp, CheckCircle2, AlertTriangle, FileText, Clock } from "lucide-react";

const metricsQO = queryOptions({
  queryKey: ["proposal-quality", "metrics"],
  queryFn: () => getProposalQualityMetrics({ data: {} }),
});

const trendsQO = queryOptions({
  queryKey: ["proposal-quality", "trends"],
  queryFn: () => getQualityTrends({ data: { days: 30 } }),
});

export const Route = createFileRoute("/_authenticated/quality")({
  head: () => ({ meta: [{ title: "Quality Dashboard — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(metricsQO);
    await context.queryClient.ensureQueryData(trendsQO);
  },
  component: QualityDashboardPage,
});

function QualityDashboardPage() {
  const fetchMetrics = useServerFn(getProposalQualityMetrics);
  const { data: metrics } = useSuspenseQuery({
    queryKey: ["proposal-quality", "metrics"],
    queryFn: () => fetchMetrics({ data: {} }),
  });

  const fetchTrends = useServerFn(getQualityTrends);
  const { data: trends } = useSuspenseQuery({
    queryKey: ["proposal-quality", "trends"],
    queryFn: () => fetchTrends({ data: { days: 30 } }),
  });

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Quality Dashboard" />

        <PageContainer size="wide">
          <PageHeader
            eyebrow="Pipeline"
            title="Quality Dashboard"
            description="Proposal quality metrics, scoring distribution, and trends."
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <p className="text-xs">Total Proposals</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Avg Score</p>
                </div>
                {/* metrics.avgScore/min/maxScore all default to 0 server-side
                    when zero proposals have been critic-reviewed yet — showed
                    a confident "0%" indistinguishable from "reviewed
                    proposals average zero quality", when the real state is
                    "nothing reviewed yet". metrics.scored disambiguates. */}
                <p className="mt-1 text-2xl font-semibold">
                  {metrics.scored > 0 ? `${(metrics.avgScore * 100).toFixed(0)}%` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Score Range</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {metrics.scored > 0
                    ? `${(metrics.minScore * 100).toFixed(0)}% – ${(metrics.maxScore * 100).toFixed(0)}%`
                    : "No scores yet"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Last 30 Days</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.recentCount}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Score Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-600">Excellent (80%+)</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{
                          width: `${metrics.scored ? (metrics.distribution.excellent / metrics.scored) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">
                      {metrics.distribution.excellent}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-600">Good (60-79%)</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{
                          width: `${metrics.scored ? (metrics.distribution.good / metrics.scored) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">
                      {metrics.distribution.good}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-amber-600">Fair (40-59%)</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{
                          width: `${metrics.scored ? (metrics.distribution.fair / metrics.scored) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">
                      {metrics.distribution.fair}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-600">Poor (&lt;40%)</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-red-500"
                        style={{
                          width: `${metrics.scored ? (metrics.distribution.poor / metrics.scored) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">
                      {metrics.distribution.poor}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(metrics.byStatus).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <Badge variant={status === "draft" ? "secondary" : "default"}>{status}</Badge>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                ))}
                {Object.keys(metrics.byStatus).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No proposals yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {trends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  Weekly Score Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-32">
                  {trends.map((t, i) => {
                    const height = Math.max(t.avgScore * 100, 4);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {(t.avgScore * 100).toFixed(0)}%
                        </span>
                        <div
                          className="w-full bg-primary/20 rounded-t"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[9px] text-muted-foreground">{t.week.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </PageContainer>
      </div>
    </PageTransition>
  );
}
