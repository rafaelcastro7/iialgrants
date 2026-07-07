import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getRateLimitStatus,
  getCacheStats,
  getBackgroundJobsStatus,
} from "@/lib/platform-monitoring.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { Shield, Database, Clock, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

const rateLimitQO = queryOptions({
  queryKey: ["monitoring", "rate-limit"],
  queryFn: () => getRateLimitStatus({ data: {} }),
});

const cacheQO = queryOptions({
  queryKey: ["monitoring", "cache"],
  queryFn: () => getCacheStats({ data: {} }),
});

const jobsQO = queryOptions({
  queryKey: ["monitoring", "jobs"],
  queryFn: () => getBackgroundJobsStatus({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/admin/monitoring")({
  head: () => ({ meta: [{ title: "Platform Monitoring — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(rateLimitQO);
    await context.queryClient.ensureQueryData(cacheQO);
    await context.queryClient.ensureQueryData(jobsQO);
  },
  component: MonitoringPage,
});

function MonitoringPage() {
  const fetchRateLimit = useServerFn(getRateLimitStatus);
  const { data: rateLimit } = useSuspenseQuery({
    queryKey: ["monitoring", "rate-limit"],
    queryFn: () => fetchRateLimit({ data: {} }),
  });

  const fetchCache = useServerFn(getCacheStats);
  const { data: cache } = useSuspenseQuery({
    queryKey: ["monitoring", "cache"],
    queryFn: () => fetchCache({ data: {} }),
  });

  const fetchJobs = useServerFn(getBackgroundJobsStatus);
  const { data: jobs } = useSuspenseQuery({
    queryKey: ["monitoring", "jobs"],
    queryFn: () => fetchJobs({ data: {} }),
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Platform Monitoring" />

        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Platform Monitoring</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Rate limiting, caching, and background job status.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <p className="text-xs">Rate Limit Requests (1h)</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{rateLimit.totalRequests}</p>
                <p className="text-[10px] text-muted-foreground">
                  {rateLimit.uniqueIPs} unique IPs
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-4 w-4" />
                  <p className="text-xs">Embedding Cache</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{cache.embeddings.totalEntries}</p>
                <p className="text-[10px] text-muted-foreground">
                  {cache.embeddings.validEntries} valid / {cache.embeddings.expiredEntries} expired
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Agent Runs (recent)</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {jobs.agents.reduce((s, a) => s + a.running + a.completed + a.failed, 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-4 w-4" />
                  Rate Limiting
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rateLimit.endpoints.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No rate limit events in the last hour.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rateLimit.endpoints.slice(0, 8).map((e) => (
                      <div
                        key={e.endpoint}
                        className="flex items-center justify-between border-b pb-2 last:border-0"
                      >
                        <span className="text-sm font-mono">{e.endpoint}</span>
                        <Badge variant="secondary">{e.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Embedding Cache
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm">Entries</span>
                  <span className="text-sm font-medium">{cache.embeddings.totalEntries}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm">TTL</span>
                  <span className="text-sm font-medium">{cache.embeddings.ttlMs} ms</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm">Hit Rate</span>
                  <span className="text-sm font-medium">
                    {cache.embeddings.validEntries + cache.embeddings.expiredEntries > 0
                      ? Math.round(
                          (cache.embeddings.validEntries /
                            (cache.embeddings.validEntries + cache.embeddings.expiredEntries)) *
                            100,
                        )
                      : 0}
                    %
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Background Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.agents.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No agent runs recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Agent</th>
                        <th className="pb-2 font-medium text-right">Running</th>
                        <th className="pb-2 font-medium text-right">Completed</th>
                        <th className="pb-2 font-medium text-right">Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.agents.map((a) => (
                        <tr key={a.agent} className="border-b last:border-0">
                          <td className="py-2 font-medium">{a.agent}</td>
                          <td className="py-2 text-right">
                            {a.running > 0 ? (
                              <Badge className="bg-blue-500/15 text-blue-700">{a.running}</Badge>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <span className="text-emerald-600">{a.completed}</span>
                          </td>
                          <td className="py-2 text-right">
                            {a.failed > 0 ? (
                              <Badge className="bg-red-500/15 text-red-700">{a.failed}</Badge>
                            ) : (
                              <CheckCircle2 className="inline h-3 w-3 text-emerald-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
