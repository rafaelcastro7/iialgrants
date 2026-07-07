import { useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFunderDashboardStats, getTopFunders } from "@/lib/funder-dashboard.functions";
import { searchFunders } from "@/lib/funder-search.functions";
import { enrichFunder } from "@/lib/funder-enrichment.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import { Search, Building2, MapPin, DollarSign, Globe, RefreshCw } from "lucide-react";

const statsQO = queryOptions({
  queryKey: ["funders", "dashboard"],
  queryFn: () => getFunderDashboardStats({ data: {} }),
});

const topFundersQO = queryOptions({
  queryKey: ["funders", "top"],
  queryFn: () => getTopFunders({ data: { metric: "recent", limit: 12 } }),
});

export const Route = createFileRoute("/_authenticated/funders/")({
  head: () => ({ meta: [{ title: "Funders — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(statsQO);
    await context.queryClient.ensureQueryData(topFundersQO);
  },
  component: FundersPage,
});

function FundersPage() {
  const fetchStats = useServerFn(getFunderDashboardStats);
  const { data: stats } = useSuspenseQuery({
    queryKey: ["funders", "dashboard"],
    queryFn: () => fetchStats({ data: {} }),
  });

  const fetchTopFunders = useServerFn(getTopFunders);
  const { data: topFunders } = useSuspenseQuery({
    queryKey: ["funders", "top"],
    queryFn: () => fetchTopFunders({ data: { metric: "recent", limit: 12 } }),
  });

  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    {
      id: string;
      name: string;
      category: string | null;
      province: string | null;
      total_revenue: number | null;
      website: string | null;
    }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const fetchSearch = useServerFn(searchFunders);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await fetchSearch({ data: { query: searchQuery.trim(), limit: 20 } });
      setSearchResults(results);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, fetchSearch]);

  const enrichMutation = useMutation({
    mutationFn: (funderId: string) => enrichFunder({ data: { funderId } }),
    onMutate: (funderId) => {
      setEnrichingId(funderId);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Funder enriched successfully");
        queryClient.invalidateQueries({ queryKey: ["funders"] });
      } else {
        toast.error(result.error || "Enrichment failed");
      }
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setEnrichingId(null),
  });

  const formatRevenue = (rev: number | null) => {
    if (!rev) return "N/A";
    if (rev >= 1_000_000) return `$${(rev / 1_000_000).toFixed(1)}M`;
    if (rev >= 1_000) return `$${(rev / 1_000).toFixed(0)}K`;
    return `$${rev.toLocaleString()}`;
  };

  const topProvinces = Object.entries(stats.byProvince)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const topTypes = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Funder Intelligence" />
        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Funder Intelligence</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              CRA T3010 registered charity data — search, analyze, and enrich Canadian funders.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <p className="text-xs">Total Funders</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{stats.totalFunders.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <p className="text-xs">Top Provinces</p>
                </div>
                <div className="mt-2 space-y-1">
                  {topProvinces.map(([prov, count]) => (
                    <div key={prov} className="flex items-center justify-between text-xs">
                      <span>{prov}</span>
                      <span className="font-medium">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <p className="text-xs">Top Types</p>
                </div>
                <div className="mt-2 space-y-1">
                  {topTypes.map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <span>{type}</span>
                      <span className="font-medium">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search Funders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, city, or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                  {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                  </p>
                  <div className="space-y-2">
                    {searchResults.map((funder) => (
                      <div
                        key={funder.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex-1">
                          <Link
                            to="/funders/$funderId"
                            params={{ funderId: funder.id }}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {funder.name}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {funder.category && (
                              <Badge variant="secondary">{funder.category}</Badge>
                            )}
                            {funder.province && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {funder.province}
                              </span>
                            )}
                            {funder.total_revenue && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {formatRevenue(funder.total_revenue)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {funder.website && (
                            <a
                              href={funder.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Globe className="h-4 w-4" />
                            </a>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => enrichMutation.mutate(funder.id)}
                            disabled={enrichingId === funder.id}
                          >
                            {enrichingId === funder.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              "Enrich"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !searching && (
                <p className="mt-4 py-4 text-center text-sm text-muted-foreground">
                  No funders found for this search.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Funders directory */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funders directory</CardTitle>
            </CardHeader>
            <CardContent>
              {topFunders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No funder data available yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {topFunders.map((funder) => (
                    <div
                      key={funder.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="flex-1">
                        <Link
                          to="/funders/$funderId"
                          params={{ funderId: funder.id }}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {funder.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {funder.category && <Badge variant="secondary">{funder.category}</Badge>}
                          {funder.province && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {funder.province}
                            </span>
                          )}
                          {funder.total_revenue && (
                            <span className="font-medium text-foreground">
                              {formatRevenue(funder.total_revenue)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {funder.website && (
                          <a
                            href={funder.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Globe className="h-4 w-4" />
                          </a>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => enrichMutation.mutate(funder.id)}
                          disabled={enrichingId === funder.id}
                        >
                          {enrichingId === funder.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            "Enrich"
                          )}
                        </Button>
                      </div>
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
