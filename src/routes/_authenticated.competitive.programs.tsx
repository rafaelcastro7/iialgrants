import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { searchCompetitiveGrants } from "@/lib/competitive-intel.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { Search, BarChart3, TrendingUp, DollarSign } from "lucide-react";

const allGrantsQO = queryOptions({
  queryKey: ["competitive", "all-grants"],
  queryFn: () => searchCompetitiveGrants({ data: { query: "", limit: 200 } }),
});

export const Route = createFileRoute("/_authenticated/competitive/programs")({
  head: () => ({ meta: [{ title: "Program Analysis — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(allGrantsQO);
  },
  component: ProgramAnalysisPage,
});

function ProgramAnalysisPage() {
  const [search, setSearch] = useState("");

  const fetchGrants = useServerFn(searchCompetitiveGrants);
  const { data: allGrants } = useSuspenseQuery({
    queryKey: ["competitive", "all-grants"],
    queryFn: () => fetchGrants({ data: { query: "", limit: 200 } }),
  });

  const programs = new Map<
    string,
    { count: number; totalAmount: number; recipients: Set<string>; years: Set<number> }
  >();
  for (const g of allGrants) {
    const name = g.program_name || "Unknown";
    const existing = programs.get(name) || {
      count: 0,
      totalAmount: 0,
      recipients: new Set(),
      years: new Set(),
    };
    existing.count++;
    existing.totalAmount += g.agreement_value || 0;
    if (g.recipient_name) existing.recipients.add(g.recipient_name);
    if (g.data_year) existing.years.add(g.data_year);
    programs.set(name, existing);
  }

  const programList = [...programs.entries()]
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      totalAmount: stats.totalAmount,
      avgAmount: stats.count > 0 ? Math.round(stats.totalAmount / stats.count) : 0,
      uniqueRecipients: stats.recipients.size,
      years: [...stats.years].sort().reverse(),
    }))
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const totalGrants = allGrants.length;
  const totalFunding = allGrants.reduce((s, g) => s + (g.agreement_value || 0), 0);

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Program Analysis" />

        <PageContainer size="wide">
          <PageHeader
            eyebrow="Market intelligence"
            title="Program Analysis"
            description="Analyze government grant programs by funding volume and recipients."
            actions={
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter programs..."
                  className="pl-9 w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            }
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-xs">Programs</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{programs.size}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <p className="text-xs">Total Funding</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">${totalFunding.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-xs">Total Grants</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{totalGrants}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Programs ({programList.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Program</th>
                      <th className="pb-2 font-medium text-right">Grants</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                      <th className="pb-2 font-medium text-right">Avg</th>
                      <th className="pb-2 font-medium text-right">Recipients</th>
                      <th className="pb-2 font-medium">Years</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programList.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 font-medium max-w-[300px] truncate">{p.name}</td>
                        <td className="py-2 text-right">{p.count}</td>
                        <td className="py-2 text-right">${p.totalAmount.toLocaleString()}</td>
                        <td className="py-2 text-right">${p.avgAmount.toLocaleString()}</td>
                        <td className="py-2 text-right">{p.uniqueRecipients}</td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            {p.years.slice(0, 3).map((y) => (
                              <Badge key={y} variant="secondary" className="text-[10px]">
                                {y}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </PageContainer>
      </div>
    </PageTransition>
  );
}
