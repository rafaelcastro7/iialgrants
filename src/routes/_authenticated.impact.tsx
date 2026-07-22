import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getImpactMetrics, getOutcomeDetails } from "@/lib/impact-measurement.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { Target, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { useUiVersion } from "@/components/v2/ui-version";

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
  const { version } = useUiVersion();
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

  if (version === "v2") {
    return <ImpactMeasurementPageV2 metrics={metrics} details={details} />;
  }

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Impact Measurement" />

        <PageContainer size="wide">
          <PageHeader
            eyebrow="Post-award"
            title="Impact Measurement"
            description="Community impact, beneficiary reach, and grant effectiveness."
          />

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
        </PageContainer>
      </div>
    </PageTransition>
  );
}

// -----------------------------------------------------------------------------
// V2 — friendly redesign (presentation only; same metrics/details queries)
// -----------------------------------------------------------------------------

type ImpactMetrics = Awaited<ReturnType<typeof getImpactMetrics>>;
type OutcomeDetails = Awaited<ReturnType<typeof getOutcomeDetails>>;

function ImpactMeasurementPageV2({
  metrics,
  details,
}: {
  metrics: ImpactMetrics;
  details: OutcomeDetails;
}) {
  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <section className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Impact</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              What your funded work has actually accomplished.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Grants won</span>
              </div>
              <p className="mt-2 text-4xl font-semibold tabular-nums">{metrics.totalWon}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                ${metrics.totalAwarded.toLocaleString()} awarded in total.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Target className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Impact documented
                </span>
              </div>
              <p className="mt-2 text-4xl font-semibold tabular-nums">
                {metrics.impactCoveragePct}%
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {metrics.withImpactDescription} of {metrics.totalWon} awards have a written impact
                summary.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Award-by-award impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              {details.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing here yet — impact notes show up once you record outcomes.
                </p>
              ) : (
                <div className="space-y-3">
                  {details.map((d) => (
                    <div key={d.outcomeId} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{d.grantTitle}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{d.proposalTitle}</p>
                        </div>
                        {d.amount != null && (
                          <span className="shrink-0 text-sm font-medium tabular-nums">
                            ${d.amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {d.impactDescription ? (
                        <p className="mt-2 rounded bg-muted/50 p-2 text-sm">
                          {d.impactDescription}
                        </p>
                      ) : (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          No impact summary recorded yet.
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
