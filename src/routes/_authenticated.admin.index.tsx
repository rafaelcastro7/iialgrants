import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminUsers } from "@/lib/admin-users.functions";
import { listModuleFlags } from "@/lib/admin-modules.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const usersQO = queryOptions({ queryKey: ["admin", "users"], queryFn: () => listAdminUsers() });
const modsQO = queryOptions({ queryKey: ["admin", "modules"], queryFn: () => listModuleFlags() });

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(usersQO),
      context.queryClient.ensureQueryData(modsQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <p className="text-sm text-destructive">Failed to load overview: {error.message}</p>
  ),
  component: AdminOverview,
});

function AdminOverview() {
  const fetchUsers = useServerFn(listAdminUsers);
  const fetchMods = useServerFn(listModuleFlags);
  const { data: u } = useSuspenseQuery({
    queryKey: ["admin", "users"],
    queryFn: () => fetchUsers(),
  });
  const { data: m } = useSuspenseQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => fetchMods(),
  });

  const totalUsers = u.users.length;
  const adminCount = u.users.filter((x) => x.is_admin).length;
  const banned = u.users.filter(
    (x) => x.banned_until && new Date(x.banned_until) > new Date(),
  ).length;
  const modsOn = m.modules.filter((x) => x.enabled).length;

  const stats = [
    { label: "Total users", value: totalUsers },
    { label: "Admins", value: adminCount },
    { label: "Banned", value: banned },
    { label: "Modules enabled", value: `${modsOn} / ${m.modules.length}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Workspace administration at a glance.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Module status</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {m.modules.map((mod) => (
              <li
                key={mod.module}
                className="flex items-center justify-between border rounded px-3 py-2"
              >
                <span className="font-mono text-xs">{mod.module}</span>
                <span
                  className={
                    mod.enabled
                      ? "text-green-600 text-xs font-semibold"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {mod.enabled ? "ON" : "OFF"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
