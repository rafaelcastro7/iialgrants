import { useState, useCallback, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLinkPreview } from "@/components/ExternalLinkPreview";
import { getFunderDashboardStats } from "@/lib/funder-dashboard.functions";
import { listFunders, searchFunders, suggestFunders } from "@/lib/funder-search.functions";
import { enrichFunder } from "@/lib/funder-enrichment.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader, StatCard, StatGrid, Section } from "@/components/PageLayout";
import { toast } from "sonner";
import { Search, Building2, MapPin, DollarSign, Globe, RefreshCw } from "lucide-react";
import { CRA_CATEGORY_TOOLTIP } from "@/lib/cra-t3010-labels";

const COUNTRY_LABELS: Record<string, string> = {
  CA: "Canada",
  US: "United States",
  INTL: "Multilateral",
  MX: "Mexico",
  BR: "Brazil",
  CL: "Chile",
  CO: "Colombia",
  AR: "Argentina",
  PE: "Peru",
  UY: "Uruguay",
  CR: "Costa Rica",
  EC: "Ecuador",
  PA: "Panama",
  DO: "Dominican Republic",
  GT: "Guatemala",
};

const statsQO = queryOptions({
  queryKey: ["funders", "dashboard"],
  queryFn: () => getFunderDashboardStats({ data: {} }),
});

const DIRECTORY_PAGE_SIZE = 50;

const directoryQO = queryOptions({
  queryKey: ["funders", "directory", "CA", 0],
  queryFn: () => listFunders({ data: { country: "CA", offset: 0, limit: DIRECTORY_PAGE_SIZE } }),
});

export const Route = createFileRoute("/_authenticated/funders/")({
  head: () => ({ meta: [{ title: "Funders — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(statsQO);
    await context.queryClient.ensureQueryData(directoryQO);
  },
  component: FundersPage,
});

function FundersPage() {
  const fetchStats = useServerFn(getFunderDashboardStats);
  const { data: stats } = useSuspenseQuery({
    queryKey: ["funders", "dashboard"],
    queryFn: () => fetchStats({ data: {} }),
  });

  // Directory browses the whole catalog, defaulting to Canada (home market)
  // with a country switcher for the rest of the Americas.
  const [directoryCountry, setDirectoryCountry] = useState<string>("CA");
  const [directoryPage, setDirectoryPage] = useState(0);
  const fetchDirectory = useServerFn(listFunders);
  const { data: directory } = useSuspenseQuery({
    queryKey: ["funders", "directory", directoryCountry, directoryPage],
    queryFn: () =>
      fetchDirectory({
        data: {
          country: directoryCountry === "all" ? undefined : directoryCountry,
          offset: directoryPage * DIRECTORY_PAGE_SIZE,
          limit: DIRECTORY_PAGE_SIZE,
        },
      }),
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
  const fetchSuggestions = useServerFn(suggestFunders);
  const [suggestions, setSuggestions] = useState<
    { id: string; name: string; country: string | null; jurisdiction: string | null }[]
  >([]);

  const handleSearch = useCallback(
    async (overrideQuery?: string) => {
      const query = (overrideQuery ?? searchQuery).trim();
      if (!query) return;
      setSuggestions([]);
      setSearching(true);
      try {
        const results = await fetchSearch({ data: { query, limit: 20 } });
        setSearchResults(results);
      } catch {
        toast.error("Search failed");
      } finally {
        setSearching(false);
      }
    },
    [searchQuery, fetchSearch],
  );

  // Debounced type-ahead over the 699-funder directory. suggestFunders already
  // existed but nothing rendered it, so the search box gave no feedback until
  // the user guessed a name exactly right and pressed Enter.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchSuggestions({ data: { query, limit: 8 } })
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchSuggestions]);

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

  const topCountries = Object.entries(stats.byCountry ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const topTypes = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Funders" />
        <PageContainer size="wide">
          <PageHeader
            eyebrow="Directory"
            title="Funder Intelligence"
            description="Funders across the Americas — CRA T3010 charities, US federal agencies and foundations, Pan-American multilaterals, and LatAm science councils."
          />

          <StatGrid columns={3}>
            <StatCard
              label="Total funders"
              value={stats.totalFunders.toLocaleString()}
              icon={Building2}
              sublabel="Funding bodies tracked"
            />
            <DistributionCard
              label="Top countries"
              icon={MapPin}
              rows={topCountries}
              formatKey={(code) => COUNTRY_LABELS[code] ?? code}
            />
            <DistributionCard
              label="Top categories"
              icon={DollarSign}
              rows={topTypes}
              formatKey={(code) => (/^\d+$/.test(code) ? `CRA ${code}` : code)}
              keyTitle={CRA_CATEGORY_TOOLTIP}
            />
          </StatGrid>

          <Section title="Search funders">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, country, jurisdiction, city, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                  aria-label="Search funders"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            setSearchQuery(s.name);
                            handleSearch(s.name);
                          }}
                        >
                          <span className="truncate">{s.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {s.jurisdiction || s.country || ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button onClick={() => handleSearch()} disabled={searching || !searchQuery.trim()}>
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
                    <FunderRow
                      key={funder.id}
                      funder={funder}
                      formatRevenue={formatRevenue}
                      enriching={enrichingId === funder.id}
                      onEnrich={() => enrichMutation.mutate(funder.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {searchQuery && searchResults.length === 0 && !searching && (
              <p className="mt-4 py-4 text-center text-sm text-muted-foreground">
                No funders found for this search.
              </p>
            )}
          </Section>

          <Section title="Funders directory">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {[
                "CA",
                ...Object.keys(stats.byCountry ?? {})
                  .filter((c) => c !== "CA")
                  .sort(),
                "all",
              ].map((code) => (
                <Button
                  key={code}
                  size="sm"
                  variant={directoryCountry === code ? "default" : "outline"}
                  onClick={() => {
                    setDirectoryCountry(code);
                    setDirectoryPage(0);
                  }}
                >
                  {code === "all"
                    ? "All countries"
                    : `${COUNTRY_LABELS[code] ?? code} (${stats.byCountry?.[code] ?? 0})`}
                </Button>
              ))}
            </div>

            {directory.funders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No funder data available yet.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {directory.funders.map((funder) => (
                    <FunderRow
                      key={funder.id}
                      funder={funder}
                      formatRevenue={formatRevenue}
                      enriching={enrichingId === funder.id}
                      onEnrich={() => enrichMutation.mutate(funder.id)}
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {directoryPage * DIRECTORY_PAGE_SIZE + 1}–
                    {directoryPage * DIRECTORY_PAGE_SIZE + directory.funders.length} of{" "}
                    {directory.total.toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={directoryPage === 0}
                      onClick={() => setDirectoryPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(directoryPage + 1) * DIRECTORY_PAGE_SIZE >= directory.total}
                      onClick={() => setDirectoryPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Section>
        </PageContainer>
      </div>
    </PageTransition>
  );
}

function DistributionCard({
  label,
  icon: Icon,
  rows,
  formatKey,
  keyTitle,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: [string, number][];
  formatKey?: (key: string) => string;
  keyTitle?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 space-y-1">
        {rows.map(([key, count]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-foreground/80" title={keyTitle}>
              {formatKey ? formatKey(key) : key}
            </span>
            <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type FunderRowData = {
  id: string;
  name: string;
  category: string | null;
  country?: string | null;
  jurisdiction?: string | null;
  province: string | null;
  total_revenue: number | null;
  disbursed_annual?: number | null;
  openGrants?: number;
  website: string | null;
};

function FunderRow({
  funder,
  formatRevenue,
  enriching,
  onEnrich,
}: {
  funder: FunderRowData;
  formatRevenue: (rev: number | null) => string;
  enriching: boolean;
  onEnrich: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/40">
      <div className="min-w-0 flex-1">
        <Link
          to="/funders/$funderId"
          params={{ funderId: funder.id }}
          className="text-sm font-medium text-primary hover:underline"
        >
          {funder.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {funder.category && (
            <Badge
              variant="secondary"
              title={/^\d+$/.test(funder.category) ? CRA_CATEGORY_TOOLTIP : undefined}
            >
              {/^\d+$/.test(funder.category) ? `CRA ${funder.category}` : funder.category}
            </Badge>
          )}
          {funder.country && <Badge variant="outline">{funder.country}</Badge>}
          {/* Jurisdiction is the only location most non-Canadian funders have —
              US federal agencies and multilaterals carry no province/city. */}
          {(funder.jurisdiction || funder.province) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {funder.jurisdiction || funder.province}
            </span>
          )}
          {(funder.total_revenue ?? funder.disbursed_annual) != null && (
            <span className="font-medium text-foreground">
              {formatRevenue(funder.total_revenue ?? funder.disbursed_annual ?? null)}
            </span>
          )}
          {funder.openGrants != null &&
            (funder.openGrants > 0 ? (
              <span className="font-medium text-foreground">
                {funder.openGrants} open call{funder.openGrants === 1 ? "" : "s"}
              </span>
            ) : (
              <span title="This funder is in the directory, but no open opportunities have been ingested for it yet, so grant search cannot surface it.">
                Directory only
              </span>
            ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {funder.website && (
          <ExternalLinkPreview
            url={funder.website}
            showIcon={false}
            title="Preview funder website"
            className="text-muted-foreground hover:text-foreground"
          >
            <Globe className="h-4 w-4" />
          </ExternalLinkPreview>
        )}
        <Button variant="outline" size="sm" onClick={onEnrich} disabled={enriching}>
          {enriching ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Enrich"}
        </Button>
      </div>
    </div>
  );
}
