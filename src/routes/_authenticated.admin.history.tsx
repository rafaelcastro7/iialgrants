import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listDiscoveryHistory } from "@/lib/admin-history.functions";
import { DataTable } from "@/components/DataTable";

const qo = queryOptions({ queryKey: ["admin", "history"], queryFn: () => listDiscoveryHistory() });

export const Route = createFileRoute("/_authenticated/admin/history")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => (
    <p className="text-sm text-destructive">Failed: {error.message}</p>
  ),
  component: HistoryPage,
});

type FunderRow = {
  id: string;
  name: string;
  jurisdiction: string | null;
  source_url: string | null;
  active: boolean;
  last_discovered_at: string | null;
};

type SourceRow = {
  funder_id: string;
  funder_name: string;
  url: string;
  http_status: number | null;
  text_length: number | null;
  grants_inserted: number;
  grants_found: number;
  times_seen: number;
  last_fetched_at: string;
};

function HistoryPage() {
  const fetchHistory = useServerFn(listDiscoveryHistory);
  const { data } = useSuspenseQuery({
    queryKey: ["admin", "history"],
    queryFn: () => fetchHistory(),
  });

  const funderById = new Map(data.funders.map((f) => [f.id, f]));

  const funderColumns: ColumnDef<FunderRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Funder",
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.name}</span>
          <p className="text-xs text-muted-foreground truncate max-w-md">
            {row.original.source_url ?? "no source url"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "jurisdiction",
      header: "Jurisdiction",
      cell: ({ row }) => <span className="text-sm">{row.original.jurisdiction ?? "—"}</span>,
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "default" : "secondary"}>
          {row.original.active ? "active" : "inactive"}
        </Badge>
      ),
    },
    {
      accessorKey: "last_discovered_at",
      header: "Last Discovered",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.last_discovered_at
            ? new Date(row.original.last_discovered_at).toLocaleString()
            : "never"}
        </span>
      ),
    },
  ];

  const sourceColumns: ColumnDef<SourceRow, unknown>[] = [
    {
      accessorKey: "funder_name",
      header: "Funder",
      cell: ({ row }) => <span className="font-medium">{row.original.funder_name}</span>,
    },
    {
      accessorKey: "url",
      header: "URL",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate max-w-md">{row.original.url}</span>
      ),
    },
    {
      accessorKey: "http_status",
      header: "HTTP",
      cell: ({ row }) => <span className="text-sm">{row.original.http_status ?? "—"}</span>,
    },
    {
      accessorKey: "grants_inserted",
      header: "Inserted",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.grants_inserted}/{row.original.grants_found}
        </span>
      ),
    },
    {
      accessorKey: "last_fetched_at",
      header: "Last Fetched",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.last_fetched_at).toLocaleString()}
        </span>
      ),
    },
  ];

  const funderRows: FunderRow[] = data.funders.map((f) => ({
    id: f.id,
    name: f.name,
    jurisdiction: f.jurisdiction,
    source_url: f.source_url,
    active: f.active,
    last_discovered_at: f.last_discovered_at,
  }));

  const sourceRows: SourceRow[] = data.sources.map((s) => ({
    funder_id: s.funder_id,
    funder_name: funderById.get(s.funder_id)?.name ?? s.funder_id,
    url: s.url,
    http_status: s.http_status,
    text_length: s.text_length,
    grants_inserted: s.grants_inserted,
    grants_found: s.grants_found,
    times_seen: s.times_seen,
    last_fetched_at: s.last_fetched_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discovery History</h1>
        <p className="text-sm text-muted-foreground">
          Cached sources and entities the Discoverer reuses across runs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funders ({data.funders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={funderColumns}
            data={funderRows}
            searchColumn="name"
            searchPlaceholder="Search funders..."
            pageSize={5}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cached sources ({data.sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No fetches yet — run Discover & Enrich.
            </p>
          ) : (
            <DataTable
              columns={sourceColumns}
              data={sourceRows}
              searchColumn="funder_name"
              searchPlaceholder="Search sources..."
              pageSize={5}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Discoverer runs</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {data.runs.length === 0 && <p className="text-muted-foreground">No runs recorded.</p>}
          {data.runs.map((r, index) => {
            const meta = (r.metadata ?? {}) as Record<string, unknown>;
            return (
              <div
                key={`${r.run_id}-${index}`}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <div>
                  <Badge
                    variant={
                      r.status === "succeeded"
                        ? "default"
                        : r.status === "degraded"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {r.status}
                  </Badge>{" "}
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {meta.cached ? (
                    <>cached ({String(meta.reason ?? "—")})</>
                  ) : (
                    <>
                      found {String(meta.found ?? 0)} · inserted {String(meta.inserted ?? 0)} · seen
                      again {String(meta.seen_again ?? 0)}
                    </>
                  )}
                  <div>{r.latency_ms}ms</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
