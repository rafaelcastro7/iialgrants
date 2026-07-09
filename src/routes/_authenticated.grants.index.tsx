import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  listGrants,
  discoverAllFunders,
  enrichGrant,
  autoEvaluatePending,
  moveGrants,
} from "@/lib/grants.functions";
import type { GrantStatus } from "@/agents/pipeline-stages.shared";
import { DiscoveryProgress } from "@/components/grants/DiscoveryProgress";
import { runEvaluator } from "@/agents/evaluator.functions";
import { runStrategist } from "@/agents/strategist.functions";
import { useIsAdmin } from "@/lib/use-platform";

import { Button } from "@/components/ui/button";
import { GrantFilters } from "@/components/grants/GrantFilters";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  applyGrantFilters,
  sortGrants,
  type SortKey,
} from "@/components/grants/grant-filters.utils";
import { EventLog } from "@/components/grants/EventLog";
import { FunderSelector } from "@/components/grants/FunderSelector";
import { NotebookLMBridge } from "@/components/grants/NotebookLMBridge";
import { GrantExpressView } from "@/components/grants/GrantExpressView";
import { GrantKanban } from "@/components/grants/GrantKanban";
import { AppTopBar } from "@/components/AppSidebar";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { GrantsListSkeleton } from "@/components/Skeletons";
import type { GrantRowData } from "@/components/grants/GrantRow";
import { isActiveGrantStatus } from "@/agents/pipeline-stages.shared";
import "@/i18n";

const grantsQueryOptions = queryOptions({
  queryKey: ["grants", "all"],
  queryFn: () => listGrants({ data: { limit: 100 } }),
});

// SSR-safe sessionStorage access (component renders on the server too).
const ss = {
  get: (k: string) => (typeof window !== "undefined" ? window.sessionStorage.getItem(k) : null),
  set: (k: string, v: string) => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(k, v);
  },
};

export const Route = createFileRoute("/_authenticated/grants/")({
  head: () => ({
    meta: [
      { title: "Grants - IIAL" },
      {
        name: "description",
        content: "Manage Canadian grant opportunities through a clear, stage-by-stage pipeline.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(grantsQueryOptions),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  pendingComponent: GrantsListSkeleton,
  component: GrantsPage,
});

function GrantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const fetchGrants = useServerFn(listGrants);
  const evaluate = useServerFn(runEvaluator);
  const strategize = useServerFn(runStrategist);
  const discoverAll = useServerFn(discoverAllFunders);
  const enrichOne = useServerFn(enrichGrant);
  const autoEvaluate = useServerFn(autoEvaluatePending);

  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());
  const [evalError, setEvalError] = useState<string | null>(null);
  const [discoveryMsg, setDiscoveryMsg] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<{ jobId: string; queued: number } | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [search, setSearch] = useState<string>(() => ss.get("grants.search") ?? "");
  const [jurisdiction, setJurisdiction] = useState<string>(
    () => ss.get("grants.jurisdiction") ?? "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (ss.get("grants.sort") as SortKey) ?? "fit",
  );
  const [eligibleOnly, setEligibleOnly] = useState(() => ss.get("grants.eligibleOnly") === "1");
  const [onlyWithDeadline, setOnlyWithDeadline] = useState(
    () => ss.get("grants.onlyWithDeadline") === "1",
  );
  const [selectedFunders, setSelectedFunders] = useState<Set<string>>(new Set());
  // Progressive disclosure: "express" is the simple default (prioritized list,
  // plain language, one action); "advanced" is the full Kanban + filters.
  const [viewMode, setViewMode] = useState<"express" | "advanced">(
    () => (ss.get("grants.viewMode") as "express" | "advanced") ?? "express",
  );
  const switchView = (mode: "express" | "advanced") => {
    setViewMode(mode);
    ss.set("grants.viewMode", mode);
  };

  // Persist filter + sort state across reloads (session scope, per house rules).
  useEffect(() => {
    ss.set("grants.search", search);
    ss.set("grants.jurisdiction", jurisdiction);
    ss.set("grants.sort", sortKey);
    ss.set("grants.eligibleOnly", eligibleOnly ? "1" : "0");
    ss.set("grants.onlyWithDeadline", onlyWithDeadline ? "1" : "0");
  }, [search, jurisdiction, sortKey, eligibleOnly, onlyWithDeadline]);

  const { data } = useSuspenseQuery({
    queryKey: ["grants", "all"],
    queryFn: () => fetchGrants({ data: { limit: 100 } }),
  });

  // Optimistic board move: update the cache immediately, roll back on error,
  // reconcile with the server on settle. The server (and the DB trigger)
  // remain the source of truth for valid transitions.
  const moveFn = useServerFn(moveGrants);
  const moveMutation = useMutation({
    mutationFn: (vars: { grantIds: string[]; toStatus: GrantStatus }) => moveFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["grants", "all"] });
      const prev = qc.getQueryData<typeof data>(["grants", "all"]);
      qc.setQueryData<typeof data>(["grants", "all"], (old) =>
        old
          ? {
              ...old,
              grants: old.grants.map((g) =>
                vars.grantIds.includes(g.id) ? { ...g, status: vars.toStatus } : g,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["grants", "all"], ctx.prev);
      setEvalError(e instanceof Error ? e.message : String(e));
    },
    onSuccess: (r) => {
      if (r.skipped.length > 0) {
        setAutoMsg(
          `${r.updated} grant(s) moved - ${r.skipped.length} skipped (invalid transition).`,
        );
      } else if (r.updated > 1) {
        setAutoMsg(`${r.updated} grants moved.`);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["grants"] }),
  });
  const onMove = (grantIds: string[], toStatus: GrantStatus) =>
    moveMutation.mutate({ grantIds, toStatus });

  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const pendingIds = data.grants
      .filter(
        (g) =>
          !g.evaluation && ["discovered", "enriched", "scored", "shortlisted"].includes(g.status),
      )
      .map((g) => g.id);
    if (pendingIds.length === 0) return;
    setEvaluatingIds(new Set(pendingIds));
    autoEvaluate({ data: { limit: 10 } })
      .then(async (r) => {
        if (r.evaluated > 0) setAutoMsg(`${r.evaluated} grant(s) auto-evaluated.`);
        else if ("reason" in r && r.reason === "org_profile_missing")
          setAutoMsg("Complete your organization profile to enable AI fit evaluation.");
        await qc.invalidateQueries({ queryKey: ["grants"] });
      })
      .catch((e) => setEvalError(e instanceof Error ? e.message : String(e)))
      .finally(() => setEvaluatingIds(new Set()));
  }, [data.grants, autoEvaluate, qc]);

  async function onEvaluate(grantId: string) {
    setPending(grantId);
    setEvalError(null);
    setEvaluatingIds((s) => new Set(s).add(grantId));
    try {
      await evaluate({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
      setEvaluatingIds((s) => {
        const n = new Set(s);
        n.delete(grantId);
        return n;
      });
    }
  }
  async function onDraft(grantId: string) {
    setPending(grantId + ":draft");
    setEvalError(null);
    try {
      const r = await strategize({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
      await navigate({ to: "/proposals/$id", params: { id: r.proposalId } });
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }
  async function onDiscoverAll() {
    setPending("__discover__");
    setDiscoveryMsg(null);
    setEvalError(null);
    try {
      const funderIds = selectedFunders.size > 0 ? [...selectedFunders] : undefined;
      const r = await discoverAll({ data: { funderIds } });
      if (r?.jobId) {
        setActiveJob({ jobId: r.jobId, queued: r.queued ?? 0 });
        const scope = funderIds ? ` (${funderIds.length} selected)` : "";
        setDiscoveryMsg(
          `Job ${r.jobId.slice(0, 8)} queued - ${r.queued} funder(s)${scope}. Live progress below.`,
        );
      } else setDiscoveryMsg("Discovery enqueued.");
      autoRan.current = false;
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }
  async function onEnrich(grantId: string) {
    setPending(grantId + ":enrich");
    setEvalError(null);
    try {
      await enrichOne({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const filtered = useMemo(
    () =>
      sortGrants(
        applyGrantFilters(data.grants, { search, jurisdiction, eligibleOnly, onlyWithDeadline }),
        sortKey,
      ) as GrantRowData[],
    [data.grants, search, jurisdiction, sortKey, eligibleOnly, onlyWithDeadline],
  );

  const activeFiltered = useMemo(
    () => filtered.filter((g) => isActiveGrantStatus(g.status)),
    [filtered],
  );

  const kpis = useMemo(() => {
    const total = activeFiltered.length;
    const needsAction = activeFiltered.filter((g) => {
      if (g.status === "discovered") return true;
      if (g.status === "enriched" && !g.evaluation) return true;
      const d = g.deadline
        ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)
        : null;
      return (
        d != null &&
        d >= 0 &&
        d <= 7 &&
        !["submitted", "won", "lost", "expired", "archived"].includes(g.status)
      );
    }).length;
    const scored = activeFiltered
      .map((g) => g.evaluation?.fit_score ?? g.fit_score)
      .filter((v): v is number => v != null);
    const avgFit = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const pipelineValueCad = activeFiltered.reduce(
      (sum, g) => sum + (g.amount_cad_max ?? g.amount_cad_min ?? 0),
      0,
    );
    return { total, needsAction, avgFit, pipelineValueCad };
  }, [activeFiltered]);

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <AppTopBar title={t("nav.grants")} />

        <PageContainer size="wide">
          <PageHeader
            eyebrow="Grants"
            title="Grants workspace"
            description={
              viewMode === "express"
                ? "Your best opportunities first. Plain and simple. Switch to Advanced for the full pipeline."
                : "Manage the lifecycle of IIAL funding opportunities from discovery to submission. Each card guides the next step."
            }
            actions={
              <Tabs value={viewMode} onValueChange={(v) => switchView(v as "express" | "advanced")}>
                <TabsList
                  className="h-11 rounded-full border border-border/70 bg-card/90 p-1 shadow-sm"
                  aria-label="View mode"
                >
                  <TabsTrigger value="express" className="min-h-9 rounded-full px-4 text-xs">
                    Express
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="min-h-9 rounded-full px-4 text-xs">
                    Advanced
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
          />

          {activeJob && (
            <DiscoveryProgress
              jobId={activeJob.jobId}
              queued={activeJob.queued}
              fr={false}
              onClose={() => {
                setActiveJob(null);
                qc.invalidateQueries({ queryKey: ["grants"] });
              }}
            />
          )}
          {discoveryMsg && !activeJob && (
            <div className="mb-4 rounded-md border bg-card px-3 py-2">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {discoveryMsg}
              </pre>
            </div>
          )}
          {autoMsg && <p className="text-sm text-muted-foreground mb-4">{autoMsg}</p>}
          {evalError && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 flex items-start justify-between gap-3">
              <p className="text-sm text-destructive break-words">{evalError}</p>
              <button
                type="button"
                onClick={() => setEvalError(null)}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {viewMode === "express" && (
            <GrantExpressView
              grants={filtered}
              evaluatingIds={evaluatingIds}
              onEvaluate={onEvaluate}
            />
          )}

          {viewMode === "advanced" && (
            <GrantKanban
              grants={filtered}
              isAdmin={isAdmin}
              pending={pending}
              evaluatingIds={evaluatingIds}
              onEnrich={onEnrich}
              onEvaluate={onEvaluate}
              onDraft={onDraft}
              onMove={isAdmin ? onMove : undefined}
              kpis={kpis}
              filters={
                <GrantFilters
                  grants={data.grants}
                  search={search}
                  setSearch={setSearch}
                  jurisdiction={jurisdiction}
                  setJurisdiction={setJurisdiction}
                  sortKey={sortKey}
                  setSortKey={setSortKey}
                  eligibleOnly={eligibleOnly}
                  setEligibleOnly={setEligibleOnly}
                  onlyWithDeadline={onlyWithDeadline}
                  setOnlyWithDeadline={setOnlyWithDeadline}
                />
              }
              toolbarRight={
                <>
                  <NotebookLMBridge />
                  {isAdmin && (
                    <>
                      <FunderSelector
                        fr={false}
                        selected={selectedFunders}
                        onChange={setSelectedFunders}
                      />
                      <Button
                        size="sm"
                        onClick={onDiscoverAll}
                        disabled={pending === "__discover__"}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {pending === "__discover__" ? t("app.loading") : "Discover & Enrich"}
                      </Button>
                    </>
                  )}
                </>
              }
            />
          )}

          {data.grants.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border/70 bg-card/90 p-10 text-center shadow-sm">
              <h2 className="mb-2 font-display text-3xl text-foreground">No grants yet</h2>
              <p className="mx-auto mb-4 max-w-xl text-sm text-muted-foreground">
                Click <b>Discover & Enrich</b> above to scan the Canadian funder catalog (Mitacs,
                NRC IRAP, SSHRC, NSERC, CIHR, Canada Council, OTF, provincial portals...). The agent
                fetches each source, extracts opportunities, and applies your Screening Rules
                automatically.
              </p>
              {isAdmin ? (
                <Button
                  onClick={onDiscoverAll}
                  disabled={pending === "__discover__"}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {pending === "__discover__" ? "Starting..." : "Run discovery now"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Ask an admin to run discovery.</p>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="mt-8">
              <EventLog fr={false} />
            </div>
          )}
        </PageContainer>
      </div>
    </PageTransition>
  );
}
