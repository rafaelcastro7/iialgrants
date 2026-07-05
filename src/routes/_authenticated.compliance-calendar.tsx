import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getComplianceCalendar,
  getComplianceStats,
  createComplianceItem,
  markComplianceComplete,
} from "@/lib/compliance-calendar.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import { Calendar, AlertTriangle, CheckCircle2, Clock, Plus } from "lucide-react";

const calendarQO = queryOptions({
  queryKey: ["compliance", "calendar"],
  queryFn: () => getComplianceCalendar({ data: {} }),
});

const statsQO = queryOptions({
  queryKey: ["compliance", "stats"],
  queryFn: () => getComplianceStats({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/compliance-calendar")({
  head: () => ({ meta: [{ title: "Compliance Calendar — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(calendarQO);
    await context.queryClient.ensureQueryData(statsQO);
  },
  component: ComplianceCalendarPage,
});

function ComplianceCalendarPage() {
  const fetchCalendar = useServerFn(getComplianceCalendar);
  const { data: items } = useSuspenseQuery({
    queryKey: ["compliance", "calendar"],
    queryFn: () => fetchCalendar({ data: {} }),
  });

  const fetchStats = useServerFn(getComplianceStats);
  const { data: stats } = useSuspenseQuery({
    queryKey: ["compliance", "stats"],
    queryFn: () => fetchStats({ data: {} }),
  });

  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [formValues, setFormValues] = useState({
    title: "",
    type: "progress_report" as const,
    dueDate: "",
    frequency: "once" as const,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["compliance", "calendar"] });
    queryClient.invalidateQueries({ queryKey: ["compliance", "stats"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createComplianceItem({
        data: {
          title: formValues.title,
          type: formValues.type,
          dueDate: formValues.dueDate,
          frequency: formValues.frequency,
        },
      }),
    onSuccess: () => {
      toast.success("Compliance item created");
      setCreateOpen(false);
      setFormValues({ title: "", type: "progress_report", dueDate: "", frequency: "once" });
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: (itemId: string) => markComplianceComplete({ data: { itemId } }),
    onSuccess: () => {
      toast.success("Item marked complete");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const urgencyColor = {
    overdue: "bg-red-500/15 text-red-700 border-red-500/25",
    urgent: "bg-amber-500/15 text-amber-700 border-amber-500/25",
    upcoming: "bg-blue-500/15 text-blue-700 border-blue-500/25",
    normal: "bg-muted text-muted-foreground",
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Compliance Calendar" />
        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl leading-none">Compliance Calendar</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Reporting deadlines and compliance milestones.
              </p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                  Create Item
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Compliance Item</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!formValues.title || !formValues.dueDate) {
                      toast.error("Title and due date are required");
                      return;
                    }
                    createMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={formValues.title}
                      onChange={(e) => setFormValues((v) => ({ ...v, title: e.target.value }))}
                      placeholder="e.g. Q3 Financial Report"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <select
                      id="type"
                      value={formValues.type}
                      onChange={(e) =>
                        setFormValues((v) => ({
                          ...v,
                          type: e.target.value as typeof formValues.type,
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="progress_report">Progress Report</option>
                      <option value="financial_report">Financial Report</option>
                      <option value="final_report">Final Report</option>
                      <option value="audit">Audit</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={formValues.dueDate}
                      onChange={(e) => setFormValues((v) => ({ ...v, dueDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <select
                      id="frequency"
                      value={formValues.frequency}
                      onChange={(e) =>
                        setFormValues((v) => ({
                          ...v,
                          frequency: e.target.value as typeof formValues.frequency,
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="once">Once</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="semi_annual">Semi-Annual</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Item"}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <p className="text-xs">Total Items</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Completed</p>
                </div>
                <p className="mt-1 text-2xl font-semibold text-emerald-600">{stats.completed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-xs">Overdue</p>
                </div>
                <p className="mt-1 text-2xl font-semibold text-red-600">{stats.overdue}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Compliance Rate</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{stats.complianceRate}%</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No compliance items tracked yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${urgencyColor[item.urgency]}`}>
                            {item.urgency}
                          </Badge>
                          <span className="text-sm font-medium">{item.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.type.replace("_", " ")} · {item.grantTitle}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium">{item.due_date}</p>
                          {item.daysUntilDue !== null && (
                            <p
                              className={`text-xs ${
                                item.daysUntilDue < 0
                                  ? "text-red-600"
                                  : item.daysUntilDue <= 7
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {item.daysUntilDue < 0
                                ? `${Math.abs(item.daysUntilDue)}d overdue`
                                : `${item.daysUntilDue}d remaining`}
                            </p>
                          )}
                        </div>
                        {item.status !== "completed" && (
                          <button
                            onClick={() => completeMutation.mutate(item.id)}
                            disabled={completeMutation.isPending}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50"
                            title="Mark as complete"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
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
