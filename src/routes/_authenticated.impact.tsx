import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getImpactMetrics, getOutcomeDetails } from "@/lib/impact-measurement.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { Target, TrendingUp, Clock, CheckCircle2 } from "lucide-react";

const metricsQO = queryOptions({
  queryKey: ["impact", "metrics"],
  queryFn: () => getImpactMetrics({ data: {} }),
});

const detailsQO = queryOptions({
  queryKey: ["impact", "details"],
  queryFn: () => getOutcomeDetails({ data: { limit: 20 } }),
});

export const Route = createFileRoute("/_authenticated/impact")({
  head: () => ({ meta: [{ title: "Impact Measurement — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(metricsQO);
    await context.queryClient.ensureQueryData(detailsQO);
  },
  component: ImpactMeasurementPage,
});

function ImpactMeasurementPage() {
  const fetchMetrics = useServerFn(getImpactMetrics);
  const { data: metrics } = useSuspenseQuery({
    queryKey: ["impact", "metrics"],
    queryFn: () => fetchMetrics({ data: {} }),
  });

  const fetchDetails = useServerFn(getOutcomeDetails);
  const { data: details } = useSuspenseQuery({
    queryKey: ["impact", "details"],
    queryFn: () => fetchDetails({ data: { limit: 20 } }),
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Impact Measurement" />

        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Impact Measurement</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Community impact, beneficiary reach, and grant effectiveness.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Grants Won</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.totalWon}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Target className="h-4 w-4" />
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
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Impact Coverage</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.impactCoveragePct}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {metrics.withImpactDescription} of {metrics.totalWon} with descriptions
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Avg Days Since Award</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{metrics.avgTimeToFunding}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outcome Details</CardTitle>
            </CardHeader>
            <CardContent>
              {details.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No outcomes recorded yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {details.map((d) => (
                    <div key={d.outcomeId} className="rounded-md border p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{d.grantTitle}</span>
                            <Badge variant={d.result === "won" ? "default" : "secondary"}>
                              {d.result}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{d.proposalTitle}</p>
                        </div>
                        {d.amount != null && (
                          <span className="text-sm font-medium">${d.amount.toLocaleString()}</span>
                        )}
                      </div>
                      {d.impactDescription && (
                        <p className="mt-2 text-sm bg-muted/50 rounded p-2">
                          {d.impactDescription}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
