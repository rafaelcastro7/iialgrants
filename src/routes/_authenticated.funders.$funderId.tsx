import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  MapPin,
  Globe,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  ArrowLeft,
  Award,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { AppTopBar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated/funders/$funderId")({
  component: FunderProfilePage,
});

function FunderProfileSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48 md:col-span-2" />
      </div>
    </div>
  );
}

function getGivingTrend(grants: { amount_max?: number | null }[]) {
  if (grants.length < 2) return "stable";
  const recent = grants.slice(0, Math.ceil(grants.length / 2));
  const older = grants.slice(Math.ceil(grants.length / 2));
  const recentAvg = recent.reduce((s, g) => s + (g.amount_max || 0), 0) / (recent.length || 1);
  const olderAvg = older.reduce((s, g) => s + (g.amount_max || 0), 0) / (older.length || 1);
  if (olderAvg === 0) return "stable";
  const change = (recentAvg - olderAvg) / olderAvg;
  if (change > 0.15) return "increasing";
  if (change < -0.15) return "decreasing";
  return "stable";
}

function FunderProfilePage() {
  const { funderId } = Route.useParams();

  const { data: funder, isLoading } = useQuery({
    queryKey: ["funder", funderId],
    queryFn: async () => {
      const { data } = await supabase.from("funders").select("*").eq("id", funderId).single();
      return data;
    },
  });

  const { data: grants } = useQuery({
    queryKey: ["funder-grants", funderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("grants")
        .select("id, title, amount_min, amount_max, deadline, status")
        .eq("funder_id", funderId)
        .order("deadline", { ascending: false });
      return data || [];
    },
    enabled: !!funderId,
  });

  const { data: givingHistory } = useQuery({
    queryKey: ["funder-giving", funderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funders")
        .select("total_giving, multi_year_count, avg_grant_size")
        .eq("id", funderId)
        .single();
      return data;
    },
    enabled: !!funderId,
  });

  if (isLoading) return <FunderProfileSkeleton />;

  if (!funder) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-muted-foreground">Funder not found.</p>
      </div>
    );
  }

  const activeGrants = grants?.filter((g) => g.status === "open") || [];
  const closedGrants = grants?.filter((g) => g.status === "closed") || [];
  const trend = getGivingTrend(grants || []);
  const totalGiving = givingHistory?.total_giving || 0;
  const avgGrant = givingHistory?.avg_grant_size || 0;
  const multiYear = givingHistory?.multi_year_count || 0;

  return (
    <PageTransition>
      <AppTopBar title={funder.name || "Funder Profile"} />
      <div className="space-y-6 p-4 md:p-6">
        <Link to="/grants">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Grants
          </Button>
        </Link>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Organization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{funder.name}</h3>
                {funder.type && <Badge variant="secondary">{funder.type}</Badge>}
              </div>
              {funder.description && (
                <p className="text-sm text-muted-foreground">{funder.description}</p>
              )}
              <div className="space-y-2 text-sm">
                {funder.geographic_focus && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {funder.geographic_focus}
                  </div>
                )}
                {funder.website && (
                  <a
                    href={funder.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <Globe className="h-4 w-4" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Financial Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Total Giving</p>
                  <p className="mt-1 text-lg font-semibold">
                    ${totalGiving > 0 ? `${(totalGiving / 1_000_000).toFixed(1)}M` : "N/A"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Avg Grant</p>
                  <p className="mt-1 text-lg font-semibold">
                    ${avgGrant > 0 ? `${(avgGrant / 1000).toFixed(0)}K` : "N/A"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">Trend</p>
                    {trend === "increasing" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                    {trend === "decreasing" && <TrendingDown className="h-3 w-3 text-red-500" />}
                    {trend === "stable" && <Minus className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <p className="mt-1 text-lg font-semibold capitalize">{trend}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Multi-Year</p>
                  <p className="mt-1 text-lg font-semibold">
                    {multiYear > 0 ? `${multiYear} grants` : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-muted-foreground" />
                Grant History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!grants?.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No grants from this funder yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {grants.map((grant) => (
                    <Link
                      key={grant.id}
                      to="/grants/$grantId"
                      params={{ grantId: grant.id }}
                      className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent/50"
                    >
                      <div>
                        <p className="text-sm font-medium">{grant.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {grant.deadline && (
                            <>
                              <Calendar className="h-3 w-3" />
                              {new Date(grant.deadline).toLocaleDateString("en-CA")}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {grant.amount_max && (
                          <span className="text-sm font-medium">
                            ${(grant.amount_max / 1000).toFixed(0)}K
                          </span>
                        )}
                        <Badge variant={grant.status === "open" ? "default" : "secondary"}>
                          {grant.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Grants</span>
                <span className="text-sm font-medium">{activeGrants.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Closed Grants</span>
                <span className="text-sm font-medium">{closedGrants.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Programs</span>
                <span className="text-sm font-medium">{grants?.length || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
