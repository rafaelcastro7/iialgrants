import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRevisionPlan } from "@/lib/revision-agent.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { AlertTriangle, CheckCircle2, FileText, ArrowRight, Zap } from "lucide-react";

function revisionQO(proposalId: string) {
  return queryOptions({
    queryKey: ["revision-plan", proposalId],
    queryFn: () => getRevisionPlan({ data: { proposalId } }),
  });
}

export const Route = createFileRoute("/_authenticated/proposals/$proposalId/revision")({
  head: () => ({ meta: [{ title: "Revision Plan — IIAL" }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(revisionQO(params.proposalId));
  },
  component: RevisionPlanPage,
});

function RevisionPlanPage() {
  const { proposalId } = Route.useParams();
  const fetchPlan = useServerFn(getRevisionPlan);
  const { data: plan } = useSuspenseQuery(revisionQO(proposalId));

  const priorityColor = {
    urgent: "text-red-600 bg-red-500/10 border-red-500/25",
    high: "text-amber-600 bg-amber-500/10 border-amber-500/25",
    normal: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25",
    none: "text-muted-foreground bg-muted border",
  };

  const severityBadge = {
    critical: "bg-red-500/15 text-red-700 border-red-500/25",
    major: "bg-amber-500/15 text-amber-700 border-amber-500/25",
    minor: "bg-blue-500/15 text-blue-700 border-blue-500/25",
    suggestion: "bg-muted text-muted-foreground",
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Revision Plan" />

        <section className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-3xl leading-none">Revision Plan</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Actionable revision suggestions prioritized by severity.
              </p>
            </div>
            <Link to="/proposals/$proposalId" params={{ proposalId }}>
              <Button variant="outline" size="sm" className="gap-1">
                Back to Proposal <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <p className="text-xs">Total Findings</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{plan.totalFindings}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-xs">Critical</p>
                </div>
                <p className="mt-1 text-2xl font-semibold text-red-600">{plan.criticalCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <p className="text-xs">Major</p>
                </div>
                <p className="mt-1 text-2xl font-semibold text-amber-600">{plan.majorCount ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Priority</p>
                </div>
                <p
                  className={`mt-1 inline-block rounded border px-2 py-0.5 text-sm font-medium capitalize ${priorityColor[plan.priority]}`}
                >
                  {plan.priority}
                </p>
              </CardContent>
            </Card>
          </div>

          {plan.reviewersConsulted && plan.reviewersConsulted.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Reviewers:</span>
              {plan.reviewersConsulted.map((r) => (
                <Badge key={r} variant="secondary" className="text-[10px]">
                  {r}
                </Badge>
              ))}
            </div>
          )}

          {plan.sections.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No findings to address. Run a review first.
                </p>
                <Link to="/proposals/$proposalId" params={{ proposalId }}>
                  <Button size="sm" className="mt-4">
                    Go to Proposal
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            plan.sections.map((section) => (
              <Card key={section.name}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{section.name}</span>
                    <div className="flex gap-1">
                      {section.critical > 0 && (
                        <Badge className={`text-[10px] ${severityBadge.critical}`}>
                          {section.critical} critical
                        </Badge>
                      )}
                      {section.major > 0 && (
                        <Badge className={`text-[10px] ${severityBadge.major}`}>
                          {section.major} major
                        </Badge>
                      )}
                      {section.minor > 0 && (
                        <Badge className={`text-[10px] ${severityBadge.minor}`}>
                          {section.minor} minor
                        </Badge>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.findings.map((f, i) => (
                    <div key={i} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`text-[10px] ${severityBadge[f.severity as keyof typeof severityBadge]}`}
                            >
                              {f.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{f.reviewer}</span>
                          </div>
                          <p className="mt-1.5 text-sm">{f.issue}</p>
                          {f.suggestion && (
                            <p className="mt-1 text-sm text-muted-foreground italic">
                              Suggestion: {f.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </div>
    </PageTransition>
  );
}
