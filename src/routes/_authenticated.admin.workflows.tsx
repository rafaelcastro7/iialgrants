import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApprovalWorkflows } from "@/lib/approval-workflows.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { GitBranch, CheckCircle2, Clock, ArrowRight } from "lucide-react";

const workflowsQO = queryOptions({
  queryKey: ["approval-workflows"],
  queryFn: () => getApprovalWorkflows({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/admin/workflows")({
  head: () => ({ meta: [{ title: "Approval Workflows — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(workflowsQO);
  },
  component: ApprovalWorkflowsPage,
});

function ApprovalWorkflowsPage() {
  const fetchWorkflows = useServerFn(getApprovalWorkflows);
  const { data: workflows } = useSuspenseQuery({
    queryKey: ["approval-workflows"],
    queryFn: () => fetchWorkflows({ data: {} }),
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Approval Workflows" />
        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Approval Workflows</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configurable approval chains for grants and proposals.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflows ({workflows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {workflows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No approval workflows configured yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {workflows.map((wf) => (
                    <div key={wf.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{wf.name}</span>
                          <Badge variant="secondary">{wf.entity_type}</Badge>
                        </div>
                        <Badge variant={wf.is_active ? "default" : "outline"}>
                          {wf.is_active ? "Active" : "Inactive"}
                        </Badge>
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
