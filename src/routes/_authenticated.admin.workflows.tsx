import { useState } from "react";
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
  getApprovalWorkflows,
  getApprovalSteps,
  submitForApproval,
  approveStep,
  createApprovalWorkflow,
} from "@/lib/approval-workflows.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Clock,
  ArrowRight,
} from "lucide-react";

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
  const queryClient = useQueryClient();
  const fetchWorkflows = useServerFn(getApprovalWorkflows);
  const fetchSteps = useServerFn(getApprovalSteps);
  const mutateSubmit = useServerFn(submitForApproval);
  const mutateApprove = useServerFn(approveStep);
  const mutateCreate = useServerFn(createApprovalWorkflow);

  const { data: workflows } = useSuspenseQuery({
    queryKey: ["approval-workflows"],
    queryFn: () => fetchWorkflows({ data: {} }),
  });

  const [expandedWfId, setExpandedWfId] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitWf, setSubmitWf] = useState<{ id: string; entityType: string } | null>(null);
  const [entityId, setEntityId] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEntityType, setNewEntityType] = useState<"grant" | "proposal">("grant");

  const stepsQuery = useSuspenseQuery({
    queryKey: ["approval-steps", expandedWfId],
    queryFn: () => fetchSteps({ data: { workflowId: expandedWfId! } }),
    enabled: !!expandedWfId,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      mutateSubmit({
        data: {
          entityType: submitWf!.entityType as "grant" | "proposal",
          entityId,
          workflowId: submitWf!.id,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-workflows"] });
      toast.success("Submitted for approval");
      setSubmitDialogOpen(false);
      setEntityId("");
      setSubmitWf(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: (vars: { instanceId: string; stepId: string; decision: "approved" | "rejected" }) =>
      mutateApprove({
        data: {
          instanceId: vars.instanceId,
          stepId: vars.stepId,
          decision: vars.decision,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-workflows"] });
      toast.success("Step decision recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      mutateCreate({
        data: {
          name: newName,
          entityType: newEntityType,
          steps: [],
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-workflows"] });
      toast.success("Workflow created");
      setCreateDialogOpen(false);
      setNewName("");
      setNewEntityType("grant");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Approval Workflows" />
        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl leading-none">Approval Workflows</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Configurable approval chains for grants and proposals.
              </p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> New Workflow
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Approval Workflow</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="wf-name">Name</Label>
                    <Input
                      id="wf-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Grant Review Chain"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wf-entity">Entity Type</Label>
                    <select
                      id="wf-entity"
                      value={newEntityType}
                      onChange={(e) => setNewEntityType(e.target.value as "grant" | "proposal")}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      <option value="grant">Grant</option>
                      <option value="proposal">Proposal</option>
                    </select>
                  </div>
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!newName || createMutation.isPending}
                    className="w-full"
                  >
                    {createMutation.isPending ? "Creating…" : "Create Workflow"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                  {workflows.map((wf) => {
                    const isExpanded = expandedWfId === wf.id;
                    const steps = isExpanded ? (stepsQuery.data ?? []) : [];
                    const instances: Array<{
                      id: string;
                      status: string;
                      current_step: number;
                      entity_id: string;
                      entity_type: string;
                    }> = (wf as Record<string, unknown>).instances
                      ? ((wf as Record<string, unknown>).instances as Array<{
                          id: string;
                          status: string;
                          current_step: number;
                          entity_id: string;
                          entity_type: string;
                        }>)
                      : [];

                    return (
                      <div key={wf.id} className="rounded-md border">
                        <div
                          className="flex cursor-pointer items-center justify-between p-4 hover:bg-muted/50"
                          onClick={() => setExpandedWfId(isExpanded ? null : wf.id)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <GitBranch className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{wf.name}</span>
                            <Badge variant="secondary">{wf.entity_type}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={wf.is_active ? "default" : "outline"}>
                              {wf.is_active ? "Active" : "Inactive"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubmitWf({ id: wf.id, entityType: wf.entity_type });
                                setSubmitDialogOpen(true);
                              }}
                            >
                              Submit for Approval
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t px-4 py-3">
                            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                              Steps
                            </h4>
                            {steps.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No steps configured.</p>
                            ) : (
                              <div className="space-y-2">
                                {steps.map((step) => (
                                  <div
                                    key={step.id}
                                    className="flex items-center justify-between rounded bg-muted/50 px-3 py-2 text-sm"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs text-muted-foreground">
                                        #{step.step_order}
                                      </span>
                                      <span>{step.name}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {step.approver_role}
                                      </Badge>
                                      <Badge
                                        variant={
                                          step.status === "approved"
                                            ? "default"
                                            : step.status === "rejected"
                                              ? "destructive"
                                              : "secondary"
                                        }
                                      >
                                        {step.status}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {instances.length > 0 && (
                              <>
                                <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-muted-foreground">
                                  Active Instances
                                </h4>
                                <div className="space-y-2">
                                  {instances.map((inst) => (
                                    <div
                                      key={inst.id}
                                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-mono text-xs">
                                          {inst.entity_type}:{inst.entity_id.slice(0, 8)}…
                                        </span>
                                        <Badge
                                          variant={
                                            inst.status === "approved"
                                              ? "default"
                                              : inst.status === "rejected"
                                                ? "destructive"
                                                : "secondary"
                                          }
                                        >
                                          {inst.status}
                                        </Badge>
                                        {inst.status === "pending" && (
                                          <span className="text-xs text-muted-foreground">
                                            step {inst.current_step}
                                          </span>
                                        )}
                                      </div>
                                      {inst.status === "pending" && (
                                        <div className="flex gap-1">
                                          {steps
                                            .filter((s) => s.step_order === inst.current_step)
                                            .map((activeStep) => (
                                              <div key={activeStep.id} className="flex gap-1">
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 px-2 text-green-600 hover:bg-green-50 hover:text-green-700"
                                                  onClick={() =>
                                                    approveMutation.mutate({
                                                      instanceId: inst.id,
                                                      stepId: activeStep.id,
                                                      decision: "approved",
                                                    })
                                                  }
                                                >
                                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                                  Approve
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                                                  onClick={() =>
                                                    approveMutation.mutate({
                                                      instanceId: inst.id,
                                                      stepId: activeStep.id,
                                                      decision: "rejected",
                                                    })
                                                  }
                                                >
                                                  <XCircle className="mr-1 h-3 w-3" />
                                                  Reject
                                                </Button>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Submit a {submitWf?.entityType} for approval via{" "}
              <strong>{workflows.find((w) => w.id === submitWf?.id)?.name}</strong>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="entity-id">Entity ID (UUID)</Label>
              <Input
                id="entity-id"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!entityId || submitMutation.isPending}
              className="w-full"
            >
              {submitMutation.isPending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
