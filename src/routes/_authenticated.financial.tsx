import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFinancialSummary, getBudgetTracking } from "@/lib/financial-tracking.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { DollarSign, TrendingUp, Calendar, BarChart3 } from "lucide-react";

const summaryQO = queryOptions({
  queryKey: ["financial", "summary"],
  queryFn: () => getFinancialSummary({ data: {} }),
});

const budgetQO = queryOptions({
  queryKey: ["financial", "budgets"],
  queryFn: () => getBudgetTracking({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/financial")({
  head: () => ({ meta: [{ title: "Financial Tracking — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(summaryQO);
    await context.queryClient.ensureQueryData(budgetQO);
  },
  component: FinancialTrackingPage,
});

function FinancialTrackingPage() {
  const fetchSummary = useServerFn(getFinancialSummary);
  const { data: summary } = useSuspenseQuery({
    queryKey: ["financial", "summary"],
    queryFn: () => fetchSummary({ data: {} }),
  });

  const fetchBudgets = useServerFn(getBudgetTracking);
  const { data: budgets } = useSuspenseQuery({
    queryKey: ["financial", "budgets"],
    queryFn: () => fetchBudgets({ data: {} }),
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Financial Tracking" />

        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Financial Tracking</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Grant expenditures, burn rates, and budget utilization.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <p className="text-xs">Total Awarded</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  ${summary.totalAwarded.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-xs">Grant Count</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{summary.grantCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Avg Grant Size</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  ${summary.avgGrantSize.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <p className="text-xs">Monthly Burn (est.)</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  ${summary.monthlyBurnEstimate.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {summary.yearOverYear.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Year-over-Year Funding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-32">
                  {summary.yearOverYear.map((y) => {
                    const max = Math.max(...summary.yearOverYear.map((x) => x.total));
                    const height = max > 0 ? (y.total / max) * 100 : 0;
                    return (
                      <div key={y.year} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          ${(y.total / 1000).toFixed(0)}K
                        </span>
                        <div
                          className="w-full bg-primary/20 rounded-t"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                        <span className="text-xs text-muted-foreground">{y.year}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {budgets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Budget Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Grant</th>
                        <th className="pb-2 font-medium text-right">Awarded</th>
                        <th className="pb-2 font-medium text-right">Budgeted</th>
                        <th className="pb-2 font-medium text-right">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgets.map((b) => (
                        <tr key={b.outcomeId} className="border-b last:border-0">
                          <td className="py-2 font-medium max-w-[300px] truncate">
                            {b.grantTitle}
                          </td>
                          <td className="py-2 text-right">${b.amountAwarded.toLocaleString()}</td>
                          <td className="py-2 text-right">${b.budgetTotal.toLocaleString()}</td>
                          <td className="py-2 text-right">
                            <Badge
                              variant={
                                b.utilizationPct > 90
                                  ? "default"
                                  : b.utilizationPct > 50
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {b.utilizationPct}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {budgets.length === 0 && summary.grantCount === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No financial data yet. Win some grants to see tracking here.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
