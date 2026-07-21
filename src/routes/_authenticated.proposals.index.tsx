import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowRight, FileText, Plus } from "lucide-react";
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
import { useUiVersion } from "@/components/v2/ui-version";
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
  const { version } = useUiVersion();
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

  if (version === "v2") {
    return (
      <ProposalsPageV2
        ingesting={ingesting}
        msg={msg}
        rows={rows}
        onIngest={onIngest}
      />
    );
  }

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

// -----------------------------------------------------------------------------
// V2 — friendly redesign (presentation only; same rows/data/handlers as v1)
// -----------------------------------------------------------------------------

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Just started", cls: "border-border bg-muted/60 text-muted-foreground" },
  in_review: { label: "In progress", cls: "border-amber-500/30 bg-amber-500/10 text-amber-700" },
  submitted: { label: "Sent", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  accepted: { label: "Accepted", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  rejected: { label: "Not this time", cls: "border-rose-500/30 bg-rose-500/10 text-rose-700" },
  withdrawn: { label: "Withdrawn", cls: "border-border bg-muted/60 text-muted-foreground" },
};

function proposalStatusPill(status: string) {
  return (
    STATUS_PILL[status] ?? {
      label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      cls: "border-border bg-muted/60 text-muted-foreground",
    }
  );
}

function qualityGrade(score: number | null): { grade: string; cls: string } {
  if (score == null) return { grade: "—", cls: "text-muted-foreground" };
  const pct = score * 100;
  if (pct >= 85) return { grade: "A", cls: "text-emerald-600" };
  if (pct >= 70) return { grade: "B", cls: "text-primary" };
  if (pct >= 55) return { grade: "C", cls: "text-amber-600" };
  return { grade: "D", cls: "text-rose-600" };
}

function ProposalsPageV2({
  ingesting,
  msg,
  rows,
  onIngest,
}: {
  ingesting: boolean;
  msg: string | null;
  rows: ProposalRow[];
  onIngest: () => void;
}) {
  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <section className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Your applications</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Every draft in one place — pick up where you left off.
              </p>
            </div>
            <Button size="sm" variant="secondary" className="gap-2" onClick={onIngest} disabled={ingesting}>
              <Plus className="h-4 w-4" />
              {ingesting ? "Working…" : "New application"}
            </Button>
          </div>

          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="mt-3 text-base font-semibold">No applications yet</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Start one from a grant you've checked the fit on.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const pill = proposalStatusPill(row.status);
                const grade = qualityGrade(row.critic_score);
                return (
                  <Link
                    key={row.id}
                    to="/proposals/$id"
                    params={{ id: row.id }}
                    className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold leading-snug">{row.title}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pill.cls}`}
                        >
                          {pill.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.grantTitle}
                        {row.grantDeadline
                          ? ` · Due ${new Date(row.grantDeadline).toLocaleDateString("en-CA")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <span className={`text-xl font-bold tabular-nums ${grade.cls}`}>{grade.grade}</span>
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Quality
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
