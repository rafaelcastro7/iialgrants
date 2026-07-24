import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRateLimitStatus, getCacheStats } from "@/lib/platform-monitoring.functions";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { Shield, Database } from "lucide-react";

const rateLimitQO = queryOptions({
  queryKey: ["monitoring", "rate-limit"],
  queryFn: () => getRateLimitStatus({ data: {} }),
});

const cacheQO = queryOptions({
  queryKey: ["monitoring", "cache"],
  queryFn: () => getCacheStats({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/admin/monitoring")({
  head: () => ({ meta: [{ title: "Platform Monitoring — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(rateLimitQO);
    await context.queryClient.ensureQueryData(cacheQO);
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

  return (
    <PageTransition>
      <PageContainer size="wide">
        <PageHeader
          eyebrow="Admin"
          title="Platform Monitoring"
          description="Rate limiting, caching, and background job status."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="h-4 w-4" />
                <p className="text-xs">Rate Limit Requests (1h)</p>
              </div>
              <p className="mt-1 text-2xl font-semibold">{rateLimit.totalRequests}</p>
              <p className="text-[10px] text-muted-foreground">{rateLimit.uniqueIPs} unique IPs</p>
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

        <p className="text-sm text-muted-foreground">
          Looking for per-agent run history, error rates, or cost? See{" "}
          <Link to="/ops" className="underline underline-offset-2">
            Operations
          </Link>
          .
        </p>
      </PageContainer>
    </PageTransition>
  );
}
