import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getTopRecipients, getRecipientProfile } from "@/lib/recipient-profiling.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { Search, Users, TrendingUp } from "lucide-react";

const topRecipientsQO = (limit: number) =>
  queryOptions({
    queryKey: ["competitive", "top-recipients", limit],
    queryFn: () => getTopRecipients({ data: { limit } }),
  });

export const Route = createFileRoute("/_authenticated/competitive/recipients")({
  head: () => ({ meta: [{ title: "Recipient Profiling — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(topRecipientsQO(25));
  },
  component: RecipientProfilingPage,
});

function RecipientProfilingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);

  const fetchTop = useServerFn(getTopRecipients);
  const { data: topRecipients } = useSuspenseQuery({
    queryKey: ["competitive", "top-recipients", 25],
    queryFn: () => fetchTop({ data: { limit: 25 } }),
  });

  const fetchProfile = useServerFn(getRecipientProfile);
  const { data: profile } = useQuery({
    queryKey: ["competitive", "recipient-profile", selectedRecipient],
    queryFn: () => fetchProfile({ data: { recipientName: selectedRecipient! } }),
    enabled: !!selectedRecipient,
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Recipient Profiling" />

        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl leading-none">Recipient Profiling</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Analyze organizations that have received government grants.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search recipients..."
                  className="pl-9 w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchTerm.trim()) {
                      setSelectedRecipient(searchTerm.trim());
                    }
                  }}
                />
              </div>
              <Button
                size="sm"
                onClick={() => searchTerm.trim() && setSelectedRecipient(searchTerm.trim())}
                disabled={!searchTerm.trim()}
              >
                Search
              </Button>
            </div>
          </div>

          {profile && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  {profile.recipientName}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total Grants</p>
                  <p className="text-2xl font-semibold">{profile.totalGrants}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Received</p>
                  <p className="text-2xl font-semibold">
                    ${profile.totalReceived.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Grant</p>
                  <p className="text-2xl font-semibold">${profile.avgGrant.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Programs</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {profile.programs.slice(0, 5).map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
              {profile.recentGrants.length > 0 && (
                <CardContent className="border-t pt-4">
                  <p className="mb-2 text-sm font-medium">Recent Grants</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 font-medium">Program</th>
                          <th className="pb-2 font-medium">Amount</th>
                          <th className="pb-2 font-medium">Year</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.recentGrants.map((g, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">{g.program_name ?? "—"}</td>
                            <td className="py-2">${g.amount?.toLocaleString() ?? "—"}</td>
                            <td className="py-2">{g.fiscal_year ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Top Recipients by Total Funding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Organization</th>
                      <th className="pb-2 font-medium text-right">Grants</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRecipients.map((r: any, i: number) => (
                      <tr
                        key={r.name}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                        onClick={() => {
                          setSearchTerm(r.name);
                          setSelectedRecipient(r.name);
                        }}
                      >
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-medium">{r.name}</td>
                        <td className="py-2 text-right">{r.count}</td>
                        <td className="py-2 text-right">${r.totalAmount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
