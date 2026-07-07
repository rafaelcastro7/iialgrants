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
      return data as any;
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
      return (data || []) as any;
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
      return data as any;
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
    status: "open" as const,
  });

  const queryClient = useQueryClient();
  const createGrant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("grants").insert({
        funder_id: funderId,
        title: grantForm.title,
        description: grantForm.description || null,
        amount_min: grantForm.amount_min ? Number(grantForm.amount_min) : null,
        amount_max: grantForm.amount_max ? Number(grantForm.amount_max) : null,
        deadline: grantForm.deadline || null,
        status: grantForm.status,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grant created");
      setCreateOpen(false);
      setGrantForm({
        title: "",
        description: "",
        amount_min: "",
        amount_max: "",
        deadline: "",
        status: "open",
      });
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

  const activeGrants = grants?.filter((g: any) => g.status === "open") || [];
  const closedGrants = grants?.filter((g: any) => g.status === "closed") || [];
  const trend = getGivingTrend(grants || []);
  const totalGiving = givingHistory?.total_giving || 0;
  const avgGrant = givingHistory?.avg_grant_size || 0;
  const multiYear = givingHistory?.multi_year_count || 0;

  const chartData = (grants || [])
    .filter((g: any) => g.amount_max)
    .slice(0, 10)
    .map((g: any) => ({
      name: g.title!.length > 20 ? g.title!.slice(0, 20) + "…" : g.title,
      amount: g.amount_max!,
      status: g.status,
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
                  {grants.map((grant: any) => (
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
