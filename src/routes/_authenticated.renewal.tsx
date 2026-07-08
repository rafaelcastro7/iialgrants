import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRenewalCandidates, getRenewalStats } from "@/lib/renewal-intelligence.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { RefreshCw, TrendingUp, Clock, Target } from "lucide-react";

const candidatesQO = queryOptions({
  queryKey: ["renewal", "candidates"],
  queryFn: () => getRenewalCandidates({ data: {} }),
});

const statsQO = queryOptions({
  queryKey: ["renewal", "stats"],
  queryFn: () => getRenewalStats({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/renewal")({
  head: () => ({ meta: [{ title: "Renewal Intelligence — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(candidatesQO);
    await context.queryClient.ensureQueryData(statsQO);
  },
  component: RenewalIntelligencePage,
});

function RenewalIntelligencePage() {
  const fetchCandidates = useServerFn(getRenewalCandidates);
  const { data: candidates } = useSuspenseQuery({
    queryKey: ["renewal", "candidates"],
    queryFn: () => fetchCandidates({ data: {} }),
  });

  const fetchStats = useServerFn(getRenewalStats);
  const { data: stats } = useSuspenseQuery({
    queryKey: ["renewal", "stats"],
    queryFn: () => fetchStats({ data: {} }),
  });

  const likelihoodColor = {
    high: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
    medium: "bg-amber-500/15 text-amber-700 border-amber-500/25",
    low: "bg-muted text-muted-foreground",
  };

  const highCount = candidates.filter((c) => c.renewalLikelihood === "high").length;
  const mediumCount = candidates.filter((c) => c.renewalLikelihood === "medium").length;

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Renewal Intelligence" />

        <PageContainer size="wide">
          <PageHeader
            eyebrow="Post-award"
            title="Renewal Intelligence"
            description="Predict renewal likelihood and track repeat funding opportunities."
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Target className="h-4 w-4" />
                  <p className="text-xs">Won Grants</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{stats.totalWon}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Unique Funders</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{stats.uniqueFunders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4" />
                  <p className="text-xs">High Renewal</p>
                </div>
                <p className="mt-1 text-2xl font-semibold text-emerald-600">{highCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Medium Renewal</p>
                </div>
                <p className="mt-1 text-2xl font-semibold text-amber-600">{mediumCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Renewal Candidates</CardTitle>
            </CardHeader>
            <CardContent>
              {candidates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No renewal candidates yet. Win some grants first.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Grant</th>
                        <th className="pb-2 font-medium text-right">Amount</th>
                        <th className="pb-2 font-medium text-right">Days Since</th>
                        <th className="pb-2 font-medium text-right">Funder Programs</th>
                        <th className="pb-2 font-medium">Likelihood</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.outcomeId} className="border-b last:border-0">
                          <td className="py-2 font-medium max-w-[300px] truncate">
                            {c.grantTitle}
                          </td>
                          <td className="py-2 text-right">${c.amount?.toLocaleString() ?? "—"}</td>
                          <td className="py-2 text-right">{c.daysSinceDecision}</td>
                          <td className="py-2 text-right">{c.funderPrograms}</td>
                          <td className="py-2">
                            <Badge
                              className={`text-[10px] ${likelihoodColor[c.renewalLikelihood]}`}
                            >
                              {c.renewalLikelihood}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </PageContainer>
      </div>
    </PageTransition>
  );
}
