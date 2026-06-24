import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { listGrants, discoverAllFunders, enrichGrant, autoEvaluatePending } from "@/lib/grants.functions";
import { DiscoveryProgress } from "@/components/grants/DiscoveryProgress";
import { runEvaluator } from "@/agents/evaluator.functions";
import { runStrategist } from "@/agents/strategist.functions";
import { useIsAdmin } from "@/lib/use-platform";

import { Button } from "@/components/ui/button";
import { GrantFilters, applyGrantFilters } from "@/components/grants/GrantFilters";
import { EventLog } from "@/components/grants/EventLog";
import { FunderSelector } from "@/components/grants/FunderSelector";
import { NotebookLMBridge } from "@/components/grants/NotebookLMBridge";
import { GrantKanban } from "@/components/grants/GrantKanban";
import type { GrantRowData } from "@/components/grants/GrantRow";
import "@/i18n";

const grantsQueryOptions = queryOptions({
  queryKey: ["grants", "all"],
  queryFn: () => listGrants({ data: { limit: 100 } }),
});

export const Route = createFileRoute("/_authenticated/grants")({
  head: () => ({
    meta: [
      { title: "Grants — IIAL" },
      { name: "description", content: "Manage Canadian grant opportunities through a clear, stage-by-stage pipeline." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(grantsQueryOptions),
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
  const [jurisdiction, setJurisdiction] = useState<string>("all");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [onlyWithDeadline, setOnlyWithDeadline] = useState(false);
  const [selectedFunders, setSelectedFunders] = useState<Set<string>>(new Set());

  const { data } = useSuspenseQuery({
    queryKey: ["grants", "all"],
    queryFn: () => fetchGrants({ data: { limit: 100 } }),
  });

  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const pendingIds = data.grants
      .filter((g) => !g.evaluation && ["discovered", "enriched", "scored", "shortlisted"].includes(g.status))
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

  async function signOut() { await supabase.auth.signOut(); await navigate({ to: "/" }); }
  async function onEvaluate(grantId: string) {
    setPending(grantId); setEvalError(null);
    setEvaluatingIds((s) => new Set(s).add(grantId));
    try {
      await evaluate({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) { setEvalError(e instanceof Error ? e.message : String(e)); }
    finally {
      setPending(null);
      setEvaluatingIds((s) => { const n = new Set(s); n.delete(grantId); return n; });
    }
  }
  async function onDraft(grantId: string) {
    setPending(grantId + ":draft"); setEvalError(null);
    try {
      const r = await strategize({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
      await navigate({ to: "/proposals/$id", params: { id: r.proposalId } });
    } catch (e) { setEvalError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(null); }
  }
  async function onDiscoverAll() {
    setPending("__discover__"); setDiscoveryMsg(null); setEvalError(null);
    try {
      const funderIds = selectedFunders.size > 0 ? [...selectedFunders] : undefined;
      const r = await discoverAll({ data: { funderIds } });
      if (r?.jobId) {
        setActiveJob({ jobId: r.jobId, queued: r.queued ?? 0 });
        const scope = funderIds ? ` (${funderIds.length} selected)` : "";
        setDiscoveryMsg(`Job ${r.jobId.slice(0, 8)} queued — ${r.queued} funder(s)${scope}. Live progress below.`);
      } else setDiscoveryMsg("Discovery enqueued.");
      autoRan.current = false;
    } catch (e) { setEvalError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(null); }
  }
  async function onEnrich(grantId: string) {
    setPending(grantId + ":enrich"); setEvalError(null);
    try { await enrichOne({ data: { grantId } }); await qc.invalidateQueries({ queryKey: ["grants"] }); }
    catch (e) { setEvalError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(null); }
  }

  const filtered = useMemo(
    () => applyGrantFilters(data.grants, { jurisdiction, eligibleOnly, onlyWithDeadline }) as GrantRowData[],
    [data.grants, jurisdiction, eligibleOnly, onlyWithDeadline],
  );

  const kpis = useMemo(() => {
    const total = filtered.length;
    const needsAction = filtered.filter((g) => {
      if (g.status === "discovered") return true;
      if (g.status === "enriched" && !g.evaluation) return true;
      const d = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000) : null;
      return d != null && d >= 0 && d <= 7 && !["submitted","won","lost","expired","archived"].includes(g.status);
    }).length;
    const scored = filtered.map((g) => g.evaluation?.fit_score ?? g.fit_score).filter((v): v is number => v != null);
    const avgFit = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const pipelineValueCad = filtered.reduce((sum, g) => sum + (g.amount_cad_max ?? g.amount_cad_min ?? 0), 0);
    return { total, needsAction, avgFit, pipelineValueCad };
  }, [filtered]);

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-foreground" style={{ fontFamily: "'Work Sans', system-ui, sans-serif" }}>
      <header className="border-b bg-card">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="font-semibold text-[#0f1b3d]" style={{ fontFamily: "'Instrument Serif', serif" }}>IIAL</Link>
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">{t("nav.dashboard")}</Link>
            <Link to="/grants" className="text-sm font-medium text-[#0f1b3d]">{t("nav.grants")}</Link>
            <Link to="/proposals" className="text-sm text-muted-foreground hover:underline">{t("nav.proposals")}</Link>
            <Link to="/org" className="text-sm text-muted-foreground hover:underline">{t("org.title")}</Link>
            <Link to="/fit-rules" className="text-sm text-muted-foreground hover:underline">Screening Rules</Link>
          </nav>
          <Button variant="outline" size="sm" onClick={signOut}>{t("nav.signOut")}</Button>
        </div>
      </header>

      <section className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-4xl text-[#0f1b3d]" style={{ fontFamily: "'Instrument Serif', serif" }}>
              Grants Workspace
            </h1>
            <p className="text-slate-500 max-w-2xl text-sm mt-1">
              Manage the lifecycle of IIAL funding opportunities from discovery to submission. Each card guides the next step.
            </p>
          </div>
        </div>

        {activeJob && (
          <DiscoveryProgress
            jobId={activeJob.jobId}
            queued={activeJob.queued}
            fr={false}
            onClose={() => { setActiveJob(null); qc.invalidateQueries({ queryKey: ["grants"] }); }}
          />
        )}
        {discoveryMsg && !activeJob && (
          <div className="mb-4 rounded-md border bg-card px-3 py-2">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{discoveryMsg}</pre>
          </div>
        )}
        {autoMsg && <p className="text-sm text-muted-foreground mb-4">{autoMsg}</p>}
        {evalError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 flex items-start justify-between gap-3">
            <p className="text-sm text-destructive break-words">{evalError}</p>
            <button type="button" onClick={() => setEvalError(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
          </div>
        )}

        <GrantKanban
          grants={filtered}
          isAdmin={isAdmin}
          pending={pending}
          evaluatingIds={evaluatingIds}
          onEnrich={onEnrich}
          onEvaluate={onEvaluate}
          onDraft={onDraft}
          kpis={kpis}
          filters={
            <GrantFilters
              grants={data.grants}
              fr={false}
              jurisdiction={jurisdiction} setJurisdiction={setJurisdiction}
              eligibleOnly={eligibleOnly} setEligibleOnly={setEligibleOnly}
              onlyWithDeadline={onlyWithDeadline} setOnlyWithDeadline={setOnlyWithDeadline}
            />
          }
          toolbarRight={
            <>
              <NotebookLMBridge />
              {isAdmin && (
                <>
                  <FunderSelector fr={false} selected={selectedFunders} onChange={setSelectedFunders} />
                  <Button size="sm" onClick={onDiscoverAll} disabled={pending === "__discover__"} className="bg-[#0f1b3d] hover:bg-[#1e3a5f]">
                    {pending === "__discover__" ? t("app.loading") : "Discover & Enrich"}
                  </Button>
                </>
              )}
            </>
          }
        />

        {data.grants.length === 0 && (
          <div className="mt-6 rounded-lg border bg-card p-10 text-center">
            <h2 className="text-2xl mb-2 text-[#0f1b3d]" style={{ fontFamily: "'Instrument Serif', serif" }}>
              No grants yet
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-4">
              Click <b>Discover & Enrich</b> above to scan the Canadian funder catalog
              (Mitacs, NRC IRAP, SSHRC, NSERC, CIHR, Canada Council, OTF, provincial portals…).
              The agent fetches each source, extracts opportunities, and applies your Screening Rules automatically.
            </p>
            {isAdmin ? (
              <Button onClick={onDiscoverAll} disabled={pending === "__discover__"} className="bg-[#0f1b3d] hover:bg-[#1e3a5f]">
                {pending === "__discover__" ? "Starting…" : "Run discovery now"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Ask an admin to run discovery.</p>
            )}
          </div>
        )}


        {isAdmin && <div className="mt-8"><EventLog fr={false} /></div>}
      </section>
    </main>
  );
}
