import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getComplianceCalendar, getComplianceStats } from "@/lib/compliance-calendar.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { Calendar, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

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
          <div>
            <h1 className="font-display text-3xl leading-none">Compliance Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reporting deadlines and compliance milestones.
            </p>
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
