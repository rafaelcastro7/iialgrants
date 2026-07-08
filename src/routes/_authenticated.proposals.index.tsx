import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listProposals, ingestOrgProfileAsKnowledge } from "@/lib/proposals.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { syncClientLocale } from "@/i18n/sync";
import { AppTopBar } from "@/components/AppSidebar";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { ProposalsListSkeleton } from "@/components/Skeletons";
import { DataTable } from "@/components/DataTable";
import "@/i18n";

type ProposalRow = {
  id: string;
  title: string;
  status: string;
  version: number;
  critic_score: number | null;
  grantTitle: string;
  grantDeadline: string | null;
};

const proposalsQueryOptions = queryOptions({
  queryKey: ["proposals", "all"],
  queryFn: () => listProposals(),
});

export const Route = createFileRoute("/_authenticated/proposals/")({
  head: () => ({
    meta: [
      { title: "Proposals — IIAL" },
      {
        name: "description",
        content:
          "AI-drafted grant proposals with cited evidence from your organization knowledge base.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(proposalsQueryOptions),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  pendingComponent: ProposalsListSkeleton,
  component: ProposalsPage,
});

function ProposalsPage() {
  const { t } = useTranslation();
  const fr = false; /* EN-only */
  const qc = useQueryClient();
  const fetchProposals = useServerFn(listProposals);
  const ingest = useServerFn(ingestOrgProfileAsKnowledge);
  const [ingesting, setIngesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { data } = useSuspenseQuery({
    queryKey: ["proposals", "all"],
    queryFn: () => fetchProposals(),
  });

  useEffect(() => {
    syncClientLocale();
  }, []);

  async function onIngest() {
    setIngesting(true);
    setMsg(null);
    try {
      const r = await ingest();
      setMsg(`+${r.inserted}`);
      await qc.invalidateQueries({ queryKey: ["proposals"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setIngesting(false);
    }
  }

  const rows: ProposalRow[] = (data.proposals || []).map((p) => {
    const grant = Array.isArray(p.grant) ? p.grant[0] : p.grant;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      version: p.version,
      critic_score: p.critic_score,
      grantTitle: grant ? (fr && grant.title_fr ? grant.title_fr : grant.title) : "—",
      grantDeadline: grant?.deadline ?? null,
    };
  });

  const columns: ColumnDef<ProposalRow, unknown>[] = [
    {
      accessorKey: "title",
      header: "Proposal",
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.title}</span>
          <p className="text-xs text-muted-foreground">From: {row.original.grantTitle}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "draft" ? "secondary" : "default"}>
          {t(`proposals.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      accessorKey: "version",
      header: "Version",
      cell: ({ row }) => <span className="text-sm">v{row.original.version}</span>,
    },
    {
      accessorKey: "critic_score",
      header: "Score",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.critic_score != null
            ? `${(Number(row.original.critic_score) * 100).toFixed(0)}%`
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "grantDeadline",
      header: "Deadline",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.grantDeadline
            ? new Date(row.original.grantDeadline).toLocaleDateString("en-CA")
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Link to="/proposals/$id" params={{ id: row.original.id }}>
          <Button size="sm" variant="ghost">
            Open →
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen">
        <AppTopBar title={t("proposals.title")} />

        <PageContainer size="default">
          <PageHeader
            eyebrow="Pipeline"
            title={t("proposals.title")}
            actions={
              <Button size="sm" variant="secondary" onClick={onIngest} disabled={ingesting}>
                {ingesting ? t("app.loading") : t("proposals.ingestKnowledge")}
              </Button>
            }
          />
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("proposals.empty")}
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              searchColumn="title"
              searchPlaceholder="Search proposals..."
            />
          )}
        </PageContainer>
      </div>
    </PageTransition>
  );
}
