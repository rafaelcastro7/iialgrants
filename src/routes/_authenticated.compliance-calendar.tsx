import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  getComplianceCalendar,
  getComplianceStats,
  createComplianceItem,
  markComplianceComplete,
} from "@/lib/compliance-calendar.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { toast } from "sonner";
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiVersion } from "@/components/v2/ui-version";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

function generateICal(
  items: { title: string; due_date: string; type: string; description?: string }[],
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IIAL//Compliance Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const item of items) {
    const d = item.due_date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.title.replace(/\s+/g, "-")}@iial`);
    lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`DTEND;VALUE=DATE:${d}`);
    lines.push(`SUMMARY:${item.title}`);
    if (item.description) lines.push(`DESCRIPTION:${item.description}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function ComplianceCalendarPage() {
  const { version } = useUiVersion();
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

  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [gridDate, setGridDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const gridYear = gridDate.getFullYear();
  const gridMonth = gridDate.getMonth();
  const gridDays = useMemo(() => getMonthDays(gridYear, gridMonth), [gridYear, gridMonth]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const existing = map.get(item.due_date) || [];
      existing.push(item);
      map.set(item.due_date, existing);
    }
    return map;
  }, [items]);

  const filteredItems = selectedDate ? itemsByDate.get(selectedDate) || [] : items;

  const urgencyColor = {
    overdue: "bg-red-500/15 text-red-700 border-red-500/25",
    urgent: "bg-amber-500/15 text-amber-700 border-amber-500/25",
    upcoming: "bg-blue-500/15 text-blue-700 border-blue-500/25",
    normal: "bg-muted text-muted-foreground",
  } as const;

  function exportICS() {
    const ics = generateICal(
      items
        .filter((i) => i.due_date && i.title)
        .map((i) => ({
          title: i.title as string,
          due_date: i.due_date as string,
          type: i.type ?? "",
          description: i.description ?? undefined,
        })),
    );
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compliance-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Calendar exported (.ics)");
  }

  if (version === "v2") {
    return (
      <ComplianceCalendarPageV2
        items={items}
        stats={stats}
        completeMutation={completeMutation}
      />
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Compliance Calendar" />
        <PageContainer size="wide">
          <PageHeader
            eyebrow="Operations"
            title="Compliance Calendar"
            description="Reporting deadlines and compliance milestones."
            actions={
              <>
                <Button variant="outline" size="sm" onClick={exportICS}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Export .ics
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Create Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    {/* ... dialog content same as before ... */}
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
                          onChange={(e) =>
                            setFormValues((v) => ({ ...v, dueDate: e.target.value }))
                          }
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
                      <Button type="submit" disabled={createMutation.isPending} className="w-full">
                        {createMutation.isPending ? "Creating..." : "Create Item"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </>
            }
          />

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

          {viewMode === "grid" && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {MONTHS[gridMonth]} {gridYear}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setGridDate(new Date(gridYear, gridMonth - 1, 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setGridDate(new Date())}
                    >
                      Today
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setGridDate(new Date(gridYear, gridMonth + 1, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-px rounded-md border bg-muted">
                  {DAYS.map((d) => (
                    <div
                      key={d}
                      className="bg-background px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                    >
                      {d}
                    </div>
                  ))}
                  {gridDays.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} className="bg-background/50" />;
                    const dateStr = `${gridYear}-${String(gridMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayItems = itemsByDate.get(dateStr) || [];
                    const isToday =
                      new Date().toDateString() ===
                      new Date(gridYear, gridMonth, day).toDateString();
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                        className={cn(
                          "flex flex-col items-center gap-0.5 bg-background px-1 py-1.5 text-sm transition-colors hover:bg-accent min-h-[56px]",
                          isToday && "font-bold",
                          isSelected && "bg-primary/10 ring-1 ring-primary",
                        )}
                      >
                        <span
                          className={cn(
                            isToday &&
                              "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground",
                          )}
                        >
                          {day}
                        </span>
                        {dayItems.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-0.5">
                            {dayItems.slice(0, 3).map((_, idx) => (
                              <span key={idx} className="h-1 w-1 rounded-full bg-primary" />
                            ))}
                            {dayItems.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">
                                +{dayItems.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Showing items for <strong>{selectedDate}</strong>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                Clear filter
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedDate ? `Deadlines on ${selectedDate}` : "Upcoming Deadlines"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {selectedDate ? "No items on this date." : "No compliance items tracked yet."}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`text-[10px] ${urgencyColor[item.urgency as keyof typeof urgencyColor]}`}
                          >
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
                              className={cn(
                                "text-xs",
                                item.daysUntilDue < 0
                                  ? "text-red-600"
                                  : item.daysUntilDue <= 7
                                    ? "text-amber-600"
                                    : "text-muted-foreground",
                              )}
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
        </PageContainer>
      </div>
    </PageTransition>
  );
}

// -----------------------------------------------------------------------------
// V2 — friendly redesign (presentation only; same items/stats/completeMutation)
// -----------------------------------------------------------------------------

type CalendarItems = Awaited<ReturnType<typeof getComplianceCalendar>>;
type ComplianceStats = Awaited<ReturnType<typeof getComplianceStats>>;

function bucketDeadlines(items: CalendarItems) {
  const thisWeek: CalendarItems = [];
  const thisMonth: CalendarItems = [];
  const later: CalendarItems = [];
  for (const item of items) {
    const days = item.daysUntilDue;
    if (days == null || days > 30) later.push(item);
    else if (days <= 7) thisWeek.push(item);
    else thisMonth.push(item);
  }
  return { thisWeek, thisMonth, later };
}

function ComplianceCalendarPageV2({
  items,
  stats,
  completeMutation,
}: {
  items: CalendarItems;
  stats: ComplianceStats;
  completeMutation: { mutate: (itemId: string) => void; isPending: boolean };
}) {
  const groups = bucketDeadlines(items.filter((i) => i.status !== "completed"));

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <section className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Deadlines</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Reports and applications due, soonest first.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <p className="text-xs">Total</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Done</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
                  {stats.completed}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-xs">Overdue</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-600">
                  {stats.overdue}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">On track</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.complianceRate}%</p>
              </CardContent>
            </Card>
          </div>

          <DeadlineGroup title="This week" items={groups.thisWeek} completeMutation={completeMutation} />
          <DeadlineGroup title="This month" items={groups.thisMonth} completeMutation={completeMutation} />
          <DeadlineGroup title="Later" items={groups.later} completeMutation={completeMutation} />

          {items.length === 0 && (
            <div className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No deadlines tracked yet.</p>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}

function DeadlineGroup({
  title,
  items,
  completeMutation,
}: {
  title: string;
  items: CalendarItems;
  completeMutation: { mutate: (itemId: string) => void; isPending: boolean };
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-[10px] font-semibold leading-tight">
              {item.due_date?.slice(5) ?? "—"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{item.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {item.type.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.grantTitle}</p>
            </div>
            <div className="shrink-0 text-right text-xs">
              {item.daysUntilDue != null && (
                <span className={item.daysUntilDue < 0 ? "text-rose-600" : "text-muted-foreground"}>
                  {item.daysUntilDue < 0
                    ? `${Math.abs(item.daysUntilDue)}d overdue`
                    : `${item.daysUntilDue}d left`}
                </span>
              )}
            </div>
            <button
              onClick={() => completeMutation.mutate(item.id)}
              disabled={completeMutation.isPending}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50"
              title="Mark as complete"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
