import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTasks } from "@/lib/team-collaboration.functions";
import { AppTopBar } from "@/components/AppSidebar";
import { PageTransition } from "@/components/PageTransition";
import { ListTodo, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

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
  const fetchTasks = useServerFn(getTasks);
  const { data: tasks } = useSuspenseQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks({ data: {} }),
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

  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar title="Tasks" />
        <section className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div>
            <h1 className="font-display text-3xl leading-none">Tasks</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Task assignments across grants and proposals.
            </p>
          </div>

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
