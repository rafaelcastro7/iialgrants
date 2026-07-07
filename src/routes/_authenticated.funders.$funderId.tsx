import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Plus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { AppTopBar } from "@/components/AppSidebar";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type FunderRow = Database["public"]["Tables"]["funders"]["Row"];
type GrantInsert = Database["public"]["Tables"]["grants"]["Insert"];

// Only the grant fields this page actually reads.
type FunderGrant = Pick<
  Database["public"]["Tables"]["grants"]["Row"],
  "id" | "title" | "amount_cad_min" | "amount_cad_max" | "deadline" | "status"
>;

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

// A grant counts as "open" when it has no deadline or the deadline is still
// in the future; otherwise it is "closed". Uses real data (the deadline
// column) instead of a status that does not exist in the grant_status enum.
function isOpen(g: Pick<FunderGrant, "deadline">): boolean {
  if (!g.deadline) return true;
  return new Date(g.deadline).getTime() >= Date.now();
}

// Compact CAD formatting: $1.2B / $336M / $24K / $850. Avoids ugly "$336000K".
function formatMoney(n: number): string {
  if (n <= 0) return "N/A";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function getGivingTrend(grants: Pick<FunderGrant, "amount_cad_max">[]) {
  if (grants.length < 2) return "stable";
  const recent = grants.slice(0, Math.ceil(grants.length / 2));
  const older = grants.slice(Math.ceil(grants.length / 2));
  const recentAvg = recent.reduce((s, g) => s + (g.amount_cad_max || 0), 0) / (recent.length || 1);
  const olderAvg = older.reduce((s, g) => s + (g.amount_cad_max || 0), 0) / (older.length || 1);
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
      return data as FunderRow | null;
    },
  });

  const { data: grants } = useQuery({
    queryKey: ["funder-grants", funderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("grants")
        .select("id, title, amount_cad_min, amount_cad_max, deadline, status")
        .eq("funder_id", funderId)
        .order("deadline", { ascending: false });
      return (data ?? []) as FunderGrant[];
    },
    enabled: !!funderId,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [grantForm, setGrantForm] = useState({
    title: "",
    description: "",
    amount_min: "",
    amount_max: "",
    deadline: "",
  });

  const queryClient = useQueryClient();
  const createGrant = useMutation({
    mutationFn: async () => {
      const insert: GrantInsert = {
        funder_id: funderId,
        title: grantForm.title,
        summary: grantForm.description || null,
        amount_cad_min: grantForm.amount_min ? Number(grantForm.amount_min) : null,
        amount_cad_max: grantForm.amount_max ? Number(grantForm.amount_max) : null,
        deadline: grantForm.deadline || null,
        status: "discovered",
        // Manual entries still need the NOT NULL provenance columns.
        url: funder?.website || `manual://funder/${funderId}`,
        source_hash: crypto.randomUUID(),
      };
      const { error } = await supabase.from("grants").insert(insert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grant created");
      setCreateOpen(false);
      setGrantForm({ title: "", description: "", amount_min: "", amount_max: "", deadline: "" });
      queryClient.invalidateQueries({ queryKey: ["funder-grants", funderId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <FunderProfileSkeleton />;

  if (!funder) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-muted-foreground">Funder not found.</p>
      </div>
    );
  }

  const grantList = grants ?? [];
  const activeGrants = grantList.filter(isOpen);
  const closedGrants = grantList.filter((g) => !isOpen(g));
  const trend = getGivingTrend(grantList);

  // Funder-level financials come from real CRA T3010 columns when present.
  const totalGiving = funder.disbursed_annual ?? funder.program_expenditures ?? 0;
  const grantAmounts = grantList
    .map((g) => g.amount_cad_max ?? g.amount_cad_min ?? 0)
    .filter((n) => n > 0);
  const avgGrant = grantAmounts.length
    ? grantAmounts.reduce((s, n) => s + n, 0) / grantAmounts.length
    : 0;
  const multiYear = grantList.length;
  const location = [funder.city, funder.province, funder.country].filter(Boolean).join(", ");

  const chartData = grantList
    .filter((g) => g.amount_cad_max)
    .slice(0, 10)
    .map((g) => ({
      name: g.title.length > 20 ? g.title.slice(0, 20) + "…" : g.title,
      amount: g.amount_cad_max ?? 0,
    }));

  const statusData = [
    { name: "Open", value: activeGrants.length, color: "#22c55e" },
    { name: "Closed", value: closedGrants.length, color: "#6b7280" },
  ];

  return (
    <PageTransition>
      <AppTopBar title={funder.name || "Funder Profile"} />
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Link to="/grants">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Grants
            </Button>
          </Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Create Grant
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Grant for {funder.name}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!grantForm.title) {
                    toast.error("Title is required");
                    return;
                  }
                  createGrant.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="grant-title">Title</Label>
                  <Input
                    id="grant-title"
                    value={grantForm.title}
                    onChange={(e) => setGrantForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grant-desc">Description</Label>
                  <Textarea
                    id="grant-desc"
                    value={grantForm.description}
                    onChange={(e) => setGrantForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="grant-min">Min Amount (CAD)</Label>
                    <Input
                      id="grant-min"
                      type="number"
                      min={0}
                      value={grantForm.amount_min}
                      onChange={(e) => setGrantForm((f) => ({ ...f, amount_min: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grant-max">Max Amount (CAD)</Label>
                    <Input
                      id="grant-max"
                      type="number"
                      min={0}
                      value={grantForm.amount_max}
                      onChange={(e) => setGrantForm((f) => ({ ...f, amount_max: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grant-deadline">Deadline</Label>
                  <Input
                    id="grant-deadline"
                    type="date"
                    value={grantForm.deadline}
                    onChange={(e) => setGrantForm((f) => ({ ...f, deadline: e.target.value }))}
                  />
                </div>
                <Button type="submit" disabled={createGrant.isPending} className="w-full">
                  {createGrant.isPending ? "Creating..." : "Create Grant"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
                {funder.category && <Badge variant="secondary">{funder.category}</Badge>}
              </div>
              {funder.designation && (
                <p className="text-sm text-muted-foreground">{funder.designation}</p>
              )}
              <div className="space-y-2 text-sm">
                {location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {location}
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
                  <p className="text-xs text-muted-foreground">Annual Disbursement</p>
                  <p className="mt-1 text-lg font-semibold">{formatMoney(totalGiving)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Avg Grant</p>
                  <p className="mt-1 text-lg font-semibold">{formatMoney(avgGrant)}</p>
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
                  <p className="text-xs text-muted-foreground">Grants Tracked</p>
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
              {!grantList.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No grants from this funder yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {grantList.map((grant) => (
                    <Link
                      key={grant.id}
                      to="/grants/$id"
                      params={{ id: grant.id }}
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
                        {grant.amount_cad_max && (
                          <span className="text-sm font-medium">
                            {formatMoney(grant.amount_cad_max)}
                          </span>
                        )}
                        <Badge variant={isOpen(grant) ? "default" : "secondary"}>
                          {isOpen(grant) ? "open" : "closed"}
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
                Grant Amounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No grant amount data available.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.every((d) => d.value === 0) ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No grants yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData.filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusData
                        .filter((d) => d.value > 0)
                        .map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
