import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAdminUsers,
  setUserAdminRole,
  inviteAdminUser,
  sendUserRecovery,
  setUserBanned,
  deleteUserHard,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const qo = queryOptions({ queryKey: ["admin", "users"], queryFn: () => listAdminUsers() });

export const Route = createFileRoute("/_authenticated/admin/users")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => (
    <p className="text-sm text-destructive">Failed: {error.message}</p>
  ),
  component: UsersPage,
});

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function UsersPage() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listAdminUsers);
  const setRole = useServerFn(setUserAdminRole);
  const invite = useServerFn(inviteAdminUser);
  const sendRecovery = useServerFn(sendUserRecovery);
  const setBanned = useServerFn(setUserBanned);
  const delUser = useServerFn(deleteUserHard);

  const { data } = useSuspenseQuery({ queryKey: ["admin", "users"], queryFn: () => fetchUsers() });
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAdmin, setInviteAdmin] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = data.users.filter(
    (u) => !search || u.email?.toLowerCase().includes(search.toLowerCase()),
  );

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function doInvite() {
    setError(null);
    try {
      await invite({ data: { email: inviteEmail, asAdmin: inviteAdmin } });
      setInviteEmail("");
      setInviteAdmin(false);
      setInviteOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">Manage workspace members and roles.</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>Invite user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a new user</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={inviteAdmin} onCheckedChange={setInviteAdmin} />
                Grant admin role on signup
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={doInvite} disabled={!inviteEmail}>
                Send invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{filtered.length} users</CardTitle>
            <Input
              placeholder="Search email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
                const busy = busyId === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.email ?? <em className="text-muted-foreground">no email</em>}
                      {u.org_name && (
                        <div className="text-xs text-muted-foreground">{u.org_name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_admin ? (
                        <Badge>admin</Badge>
                      ) : (
                        <Badge variant="secondary">member</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs uppercase">{u.preferred_lang ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmt(u.last_sign_in_at)}
                    </TableCell>
                    <TableCell>
                      {isBanned ? (
                        <Badge variant="destructive">banned</Badge>
                      ) : (
                        <Badge variant="outline">active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(u.id, () => setRole({ data: { userId: u.id, admin: !u.is_admin } }))
                          }
                        >
                          {u.is_admin ? "Revoke admin" : "Make admin"}
                        </Button>
                        {u.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              run(u.id, () => sendRecovery({ data: { email: u.email! } }))
                            }
                          >
                            Reset pw
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run(u.id, () =>
                              setBanned({ data: { userId: u.id, banned: !isBanned } }),
                            )
                          }
                        >
                          {isBanned ? "Unban" : "Ban"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => setConfirmDelete(u.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        </CardContent>
      </Card>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user permanently?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will delete the auth account and cascade-remove all of their data. This cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmDelete) return;
                const id = confirmDelete;
                setConfirmDelete(null);
                await run(id, () => delUser({ data: { userId: id } }));
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
