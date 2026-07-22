import { useState, type Dispatch, type SetStateAction } from "react";
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
import { Button } from "@/components/ui/button";
import { getTasks, createTask, updateTaskStatus } from "@/lib/team-collaboration.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { ListTodo, Clock, CheckCircle2, Plus, ArrowRight, Circle } from "lucide-react";
import { toast } from "sonner";
import type { TenantEntityType } from "@/lib/tenant-access.server";
import { useUiVersion } from "@/components/v2/ui-version";

type TaskForm = {
  title: string;
  entityType: TenantEntityType;
  entityId: string;
  priority: "low" | "medium" | "high";
  dueDate: string;
};

const tasksQO = queryOptions({
  queryKey: ["tasks"],
  queryFn: () => getTasks({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — IIAL" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(tasksQO);
  },
  component: TasksPage,
});

function TasksPage() {
  const { version } = useUiVersion();
  const queryClient = useQueryClient();
  const fetchTasks = useServerFn(getTasks);
  const { data: tasks } = useSuspenseQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks({ data: {} }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>({
    title: "",
    entityType: "grant",
    entityId: "",
    priority: "medium",
    dueDate: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      createTask({
        data: {
          title: data.title,
          entityType: data.entityType,
          entityId: data.entityId,
          priority: data.priority,
          dueDate: data.dueDate || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
      setDialogOpen(false);
      setForm({ title: "", entityType: "grant", entityId: "", priority: "medium", dueDate: "" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: (args: { taskId: string; status: "in_progress" | "completed" }) =>
      updateTaskStatus({ data: args }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pending = tasks.filter((t) => t.status === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");

  const priorityColor = {
    high: "bg-red-500/15 text-red-700 border-red-500/25",
    medium: "bg-amber-500/15 text-amber-700 border-amber-500/25",
    low: "bg-muted text-muted-foreground",
  };

  const statusIcon = {
    pending: <Clock className="h-3 w-3 text-amber-500" />,
    in_progress: <ListTodo className="h-3 w-3 text-blue-500" />,
    completed: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  };

  if (version === "v2") {
    return (
      <TasksPageV2
        tasks={tasks}
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
        form={form}
        setForm={setForm}
        createMutation={createMutation}
        statusMutation={statusMutation}
      />
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title="Tasks" />
        <PageContainer size="wide">
          <PageHeader
            eyebrow="Operations"
            title="Tasks"
            description="Task assignments across grants and proposals."
            actions={
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!form.title.trim()) return toast.error("Title is required");
                      if (!form.entityId.trim()) return toast.error("Entity ID is required");
                      createMutation.mutate(form);
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="task-title">Title</Label>
                      <Input
                        id="task-title"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Task title"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="task-entity">Entity Type</Label>
                        <select
                          id="task-entity"
                          value={form.entityType}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              entityType: e.target.value as TenantEntityType,
                            }))
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="grant">Grant</option>
                          <option value="proposal">Proposal</option>
                          <option value="submission">Submission</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="task-priority">Priority</Label>
                        <select
                          id="task-priority"
                          value={form.priority}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              priority: e.target.value as "low" | "medium" | "high",
                            }))
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="task-entity-id">Entity ID</Label>
                        <Input
                          id="task-entity-id"
                          value={form.entityId}
                          onChange={(e) => setForm((f) => ({ ...f, entityId: e.target.value }))}
                          placeholder="UUID"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="task-due">Due Date</Label>
                        <Input
                          id="task-due"
                          type="date"
                          value={form.dueDate}
                          onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Creating..." : "Create Task"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            }
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Pending</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{pending.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ListTodo className="h-4 w-4" />
                  <p className="text-xs">In Progress</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{inProgress.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Completed</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{completed.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No tasks assigned yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {statusIcon[task.status as keyof typeof statusIcon]}
                        <div>
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.entity_type} · {task.status.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`text-[10px] ${priorityColor[task.priority as keyof typeof priorityColor]}`}
                        >
                          {task.priority}
                        </Badge>
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground">{task.due_date}</span>
                        )}
                        {task.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Start task"
                            onClick={() =>
                              statusMutation.mutate({ taskId: task.id, status: "in_progress" })
                            }
                            disabled={statusMutation.isPending}
                          >
                            <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                        )}
                        {task.status === "in_progress" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Complete task"
                            onClick={() =>
                              statusMutation.mutate({ taskId: task.id, status: "completed" })
                            }
                            disabled={statusMutation.isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          </Button>
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
// V2 — friendly redesign (presentation only; same tasks/mutations as v1)
// -----------------------------------------------------------------------------

type TaskRow = Awaited<ReturnType<typeof getTasks>>[number];

function bucketTasks(tasks: TaskRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const dueToday: TaskRow[] = [];
  const thisWeek: TaskRow[] = [];
  const later: TaskRow[] = [];

  for (const task of tasks) {
    if (!task.due_date) {
      later.push(task);
      continue;
    }
    const due = new Date(task.due_date);
    if (due <= today) dueToday.push(task);
    else if (due <= weekEnd) thisWeek.push(task);
    else later.push(task);
  }

  return { dueToday, thisWeek, later };
}

function TasksPageV2({
  tasks,
  dialogOpen,
  setDialogOpen,
  form,
  setForm,
  createMutation,
  statusMutation,
}: {
  tasks: TaskRow[];
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  form: TaskForm;
  setForm: Dispatch<SetStateAction<TaskForm>>;
  createMutation: { mutate: (data: TaskForm) => void; isPending: boolean };
  statusMutation: {
    mutate: (args: { taskId: string; status: "in_progress" | "completed" }) => void;
    isPending: boolean;
  };
}) {
  const pending = tasks.filter((t) => t.status === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const groups = bucketTasks(tasks.filter((t) => t.status !== "completed"));

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <section className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                What needs your attention, grouped by when it's due.
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  New task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Task</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!form.title.trim()) return toast.error("Title is required");
                    if (!form.entityId.trim()) return toast.error("Entity ID is required");
                    createMutation.mutate(form);
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="task-title-v2">Title</Label>
                    <Input
                      id="task-title-v2"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Task title"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="task-entity-v2">Entity Type</Label>
                      <select
                        id="task-entity-v2"
                        value={form.entityType}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, entityType: e.target.value as TenantEntityType }))
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="grant">Grant</option>
                        <option value="proposal">Proposal</option>
                        <option value="submission">Submission</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-priority-v2">Priority</Label>
                      <select
                        id="task-priority-v2"
                        value={form.priority}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            priority: e.target.value as TaskForm["priority"],
                          }))
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="task-entity-id-v2">Entity ID</Label>
                      <Input
                        id="task-entity-id-v2"
                        value={form.entityId}
                        onChange={(e) => setForm((f) => ({ ...f, entityId: e.target.value }))}
                        placeholder="UUID"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-due-v2">Due Date</Label>
                      <Input
                        id="task-due-v2"
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating…" : "Create Task"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <p className="text-xs">Not started</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{pending.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ListTodo className="h-4 w-4" />
                  <p className="text-xs">In progress</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{inProgress.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs">Done</p>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {tasks.filter((t) => t.status === "completed").length}
                </p>
              </CardContent>
            </Card>
          </div>

          <TaskGroup title="Due today" tasks={groups.dueToday} statusMutation={statusMutation} />
          <TaskGroup title="This week" tasks={groups.thisWeek} statusMutation={statusMutation} />
          <TaskGroup title="Later" tasks={groups.later} statusMutation={statusMutation} />

          {tasks.length === 0 && (
            <div className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}

function TaskGroup({
  title,
  tasks,
  statusMutation,
}: {
  title: string;
  tasks: TaskRow[];
  statusMutation: {
    mutate: (args: { taskId: string; status: "in_progress" | "completed" }) => void;
    isPending: boolean;
  };
}) {
  if (tasks.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 rounded-md border p-3">
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-primary"
              disabled={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({
                  taskId: task.id,
                  status: task.status === "pending" ? "in_progress" : "completed",
                })
              }
              aria-label={task.status === "pending" ? "Start task" : "Complete task"}
            >
              {task.status === "in_progress" ? (
                <ArrowRight className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {task.entity_type}
                {task.due_date && ` · Due ${task.due_date}`}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
