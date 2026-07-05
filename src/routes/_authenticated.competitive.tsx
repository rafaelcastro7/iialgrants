import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getCompetitiveLandscape,
  getTopRecipients,
  searchCompetitiveGrants,
} from "@/lib/competitive-intel.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { BarChart3, Users, TrendingUp, Search } from "lucide-react";

const landscapeQO = queryOptions({
  queryKey: ["competitive", "landscape"],
  queryFn: () => getCompetitiveLandscape({ data: {} }),
});

const topRecipientsQO = queryOptions({
  queryKey: ["competitive", "top-recipients"],
  queryFn: () => getTopRecipients({ data: { limit: 10 } }),
});

export const Route = createFileRoute("/_authenticated/competitive")({
  head: () => ({ meta: [{ title: "Competitive Intel — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(landscapeQO);
    await context.queryClient.ensureQueryData(topRecipientsQO);
  },
  component: CompetitivePage,
});

function CompetitivePage() {
  const fetchLandscape = useServerFn(getCompetitiveLandscape);
  const { data: landscape } = useSuspenseQuery({
    queryKey: ["competitive", "landscape"],
    queryFn: () => fetchLandscape({ data: {} }),
  });

  const fetchTop = useServerFn(getTopRecipients);
  const { data: topRecipients } = useSuspenseQuery({
    queryKey: ["competitive", "top-recipients"],
    queryFn: () => fetchTop({ data: { limit: 10 } }),
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Competitive Intelligence" />

        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Competitive Intelligence</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Canadian government grant landscape — TBS Proactive Disclosure data.
            </p>
            <div className="mt-3 flex gap-2">
              <Link to="/competitive/recipients" className="text-sm text-primary hover:underline">
                Recipient Profiling →
              </Link>
              <Link to="/competitive/programs" className="text-sm text-primary hover:underline">
                Program Analysis →
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-xs">Total Grants</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {landscape.totalGrants.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Total Value</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  ${(landscape.totalValue / 1_000_000).toFixed(0)}M
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg Grant</p>
                <p className="mt-1 text-2xl font-semibold">
                  ${(landscape.avgValue / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Programs</p>
                <p className="mt-1 text-2xl font-semibold">{landscape.topPrograms.length}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Top Programs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {landscape.topPrograms.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <span className="text-sm truncate max-w-xs">{p.name}</span>
                    <Badge variant="secondary">{p.count.toLocaleString()}</Badge>
                  </div>
                ))}
                {landscape.topPrograms.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No data available. Run the competitive grants import first.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Top Recipients
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topRecipients.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.count} grants · {r.province || "—"}
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0">
                      ${(r.totalValue / 1000).toFixed(0)}K
                    </span>
                  </div>
                ))}
                {topRecipients.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No recipient data available.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
