import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuditHistory } from "@/lib/audit-trail.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { History, FileText, Trash2, Edit, ArrowRight } from "lucide-react";

const auditQO = queryOptions({
  queryKey: ["audit-trail"],
  queryFn: () => getAuditHistory({ data: { limit: 100 } }),
});

export const Route = createFileRoute("/_authenticated/admin/audit-trail")({
  head: () => ({ meta: [{ title: "Audit Trail — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(auditQO);
  },
  component: AuditTrailPage,
});

function AuditTrailPage() {
  const fetchAudit = useServerFn(getAuditHistory);
  const { data: events } = useSuspenseQuery({
    queryKey: ["audit-trail"],
    queryFn: () => fetchAudit({ data: { limit: 100 } }),
  });

  const actionIcon: Record<string, typeof FileText> = {
    create: FileText,
    update: Edit,
    delete: Trash2,
    status_change: ArrowRight,
    approval: ArrowRight,
    submission: ArrowRight,
  };

  const actionColor: Record<string, string> = {
    create: "bg-emerald-500/15 text-emerald-700",
    update: "bg-blue-500/15 text-blue-700",
    delete: "bg-red-500/15 text-red-700",
    status_change: "bg-amber-500/15 text-amber-700",
    approval: "bg-purple-500/15 text-purple-700",
    submission: "bg-indigo-500/15 text-indigo-700",
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Audit Trail" />
        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Audit Trail</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete change history for all entities.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Events ({events.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No audit events recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {events.map((event) => {
                    const Icon = actionIcon[event.action] || FileText;
                    return (
                      <div
                        key={event.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`text-[10px] ${actionColor[event.action] || "bg-muted text-muted-foreground"}`}
                              >
                                {event.action}
                              </Badge>
                              <span className="text-sm font-medium">{event.entity_type}</span>
                            </div>
                            {event.changes && event.changes.length > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {event.changes.map((c: { field: string }) => c.field).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
