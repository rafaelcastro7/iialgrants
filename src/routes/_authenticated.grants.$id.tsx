// Drill-down page for a single grant — full eligibility, sectors, evaluation
// rationale, and the audit timeline. Linked from every row in /grants.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, Building2, Calendar, DollarSign, Tag, Globe } from "lucide-react";
import { getGrantDetail } from "@/lib/grant-detail.functions";
import { runEvaluator } from "@/agents/evaluator.functions";
import { runStrategist } from "@/agents/strategist.functions";
import { enrichGrant } from "@/lib/grants.functions";
import { useIsAdmin } from "@/lib/use-platform";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FitEvaluation } from "@/components/grants/FitEvaluation";
import { FreshnessBadges } from "@/components/grants/FreshnessBadges";
import { EvidencePanel, EvidenceChip } from "@/components/grants/EvidencePanel";
import { AgentTracePanel } from "@/components/grants/AgentTracePanel";
import { OpportunityBriefPanel } from "@/components/grants/OpportunityBriefPanel";
import { NotebookLMBridge } from "@/components/grants/NotebookLMBridge";
import { EvaluationDetail } from "@/components/grants/EvaluationDetail";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import "@/i18n";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["grant-detail", id],
    queryFn: () => getGrantDetail({ data: { id } }),
  });

type GrantSearch = {
  evidence?: string;
  run?: string;
  agent?: string;
  step?: string;
};

export const Route = createFileRoute("/_authenticated/grants/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Grant ${params.id.slice(0, 8)} — IIAL` }],
  }),
  validateSearch: (raw: Record<string, unknown>): GrantSearch => ({
    evidence: typeof raw.evidence === "string" ? raw.evidence : undefined,
    run: typeof raw.run === "string" ? raw.run : undefined,
    agent: typeof raw.agent === "string" ? raw.agent : undefined,
    step: typeof raw.step === "string" ? raw.step : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(detailQuery(params.id)),
  component: GrantDetailPage,
});


function GrantDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const { t, i18n } = useTranslation();
  const fr = false /* EN-only */;
  const navigate = useNavigate();
  void useIsAdmin; // imported for potential future admin-only actions
  const qc = useQueryClient();
  const evaluate = useServerFn(runEvaluator);
  const enrichOne = useServerFn(enrichGrant);
  const strategize = useServerFn(runStrategist);
  const { data } = useSuspenseQuery(detailQuery(id));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [evField, setEvField] = useState<string | null>(search.evidence ?? null);
  const [traceRun, setTraceRun] = useState<{ runId: string; agent: string } | null>(
    search.run ? { runId: search.run, agent: search.agent ?? "" } : null,
  );

  // Sync URL → state when the user navigates with a deep-link mid-session.
  useEffect(() => { setEvField(search.evidence ?? null); }, [search.evidence]);
  useEffect(() => {
    if (search.run) setTraceRun({ runId: search.run, agent: search.agent ?? "" });
    else setTraceRun(null);
  }, [search.run, search.agent]);

  // Auto-fetch details on first open when the grant has never been enriched.
  // Keeps the click-through useful even when discovery hasn't run the enricher
  // pass yet. Idempotent: enrichGrantImpl returns early if already fresh.
  const needsEnrich = !data.grant.enriched_at && data.grant.status === "discovered";
  useEffect(() => {
    if (!needsEnrich || busy) return;
    run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, needsEnrich]);

  // State → URL: keep the deep-link sharable as the user opens panels.
  const patchSearch = (patch: Partial<GrantSearch>) =>
    navigate({
      to: "/grants/$id",
      params: { id },
      search: (prev: GrantSearch) => ({ ...prev, ...patch }),
      replace: true,
    });
  const openEvidence = (f: string) => { setEvField(f); patchSearch({ evidence: f }); };
  const closeEvidence = () => { setEvField(null); patchSearch({ evidence: undefined }); };
  const closeTrace = () => { setTraceRun(null); patchSearch({ run: undefined, agent: undefined, step: undefined }); };


  const g = data.grant as unknown as {
    id: string; title: string; title_fr: string | null; summary: string | null; summary_fr: string | null;
    amount_cad_min: number | null; amount_cad_max: number | null; deadline: string | null;
    sectors: string[] | null; eligibility: Record<string, unknown> | null;
    language: string; url: string; status: string; fit_score: number | null;
    discovered_at: string | null; enriched_at: string | null; scored_at: string | null;
    last_seen_at: string | null; times_seen: number | null;
    funder: { id: string; name: string; name_fr: string | null; jurisdiction: string | null; source_url: string | null } | null;
  };
  const title = (fr && g.title_fr) ? g.title_fr : g.title;
  const summary = (fr && g.summary_fr) ? g.summary_fr : g.summary;
  const funderName = g.funder ? (fr && g.funder.name_fr ? g.funder.name_fr : g.funder.name) : "—";
  const fmt = (n: number | null) =>
    n == null ? "—" : new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

  async function run(label: string, agent: string, fn: () => Promise<unknown>) {
    setBusy(label); setErr(null);
    try {
      const result = await fn();
      const runId = (result as { runId?: string } | undefined)?.runId;
      if (runId) { setTraceRun({ runId, agent }); patchSearch({ run: runId, agent }); }
      await qc.invalidateQueries({ queryKey: ["grant-detail", id] });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/grants"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.grants")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to="/grants/$id/audit" params={{ id }}>Audit trail →</Link>
          </Button>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-tight">{title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                <Building2 className="h-3.5 w-3.5 inline mr-1" />
                {funderName}{g.funder?.jurisdiction ? ` · ${g.funder.jurisdiction}` : ""}
              </p>
            </div>
            <Badge variant={g.status === "shortlisted" ? "default" : "secondary"}>
              {t(`grants.status.${g.status}`)}
            </Badge>
          </div>
          <FreshnessBadges discoveredAt={g.discovered_at} deadline={g.deadline} fr={fr} />
        </div>

        {err && <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</div>}
        {busy === "enrich" && (
          <div className="rounded-md border border-blue-500/40 bg-blue-500/5 px-3 py-2 text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 animate-pulse" />
            Fetching live details from the funder's page… this can take 20–60 s.
          </div>
        )}
        {!data.grant.enriched_at && !busy && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            This grant was discovered but full details haven't been fetched yet. Use <b>Fetch details</b> below or wait — auto-fetch is running.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" />{t("grants.amount")}</CardTitle></CardHeader>
            <CardContent className="text-sm tabular-nums space-y-1.5">
              <div>{fmt(g.amount_cad_min)} – {fmt(g.amount_cad_max)}</div>
              {(g.amount_cad_min != null || g.amount_cad_max != null) && (
                <EvidenceChip field="amount_cad_max" label={fr ? "Voir la source" : "View source"} onClick={openEvidence} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t("grants.deadline")}</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1.5">
              <div>{g.deadline ?? "—"}</div>
              {g.deadline && (
                <EvidenceChip field="deadline" label={fr ? "Voir la source" : "View source"} onClick={openEvidence} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{fr ? "Langue" : "Language"}</CardTitle></CardHeader>
            <CardContent className="text-sm uppercase">{g.language}</CardContent>
          </Card>
        </div>

        {summary && (
          <Card>
            <CardHeader><CardTitle className="text-base">{fr ? "Résumé" : "Summary"}</CardTitle></CardHeader>
            <CardContent className="text-sm leading-relaxed">{summary}</CardContent>
          </Card>
        )}

        {g.sectors && g.sectors.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />{fr ? "Secteurs" : "Sectors"}</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {g.sectors.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              <EvidenceChip field="sectors" label={fr ? "Sources" : "Sources"} onClick={openEvidence} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <FitEvaluation
            status={g.status}
            discoveredAt={g.discovered_at}
            enrichedAt={g.enriched_at}
            scoredAt={g.scored_at}
            evaluation={data.evaluation as { fit_score: number; eligibility_pass: boolean; rationale_en: string; rationale_fr: string; created_at: string } | null}
            fr={fr}
          />
          {data.evaluation && (
            <div className="flex gap-2 flex-wrap pl-2">
              <EvidenceChip field="fit_score" label={fr ? "Pourquoi ce score ?" : "Why this score?"} onClick={openEvidence} />
              <EvidenceChip field="eligibility_pass" label={fr ? "Pourquoi admissible ?" : "Why eligible?"} onClick={openEvidence} />
            </div>
          )}
        </div>

        {g.enriched_at && <EvaluationDetail grantId={id} />}



        {g.eligibility && Object.keys(g.eligibility).length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{fr ? "Admissibilité" : "Eligibility"}</CardTitle>
              <EvidenceChip field="eligibility" label={fr ? "Sources" : "Sources"} onClick={openEvidence} />
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 p-3 rounded">{JSON.stringify(g.eligibility, null, 2)}</pre>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">{fr ? "Chronologie" : "Timeline"}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.events.length === 0 && <p className="text-xs text-muted-foreground">{fr ? "Aucun événement." : "No events yet."}</p>}
            {data.events.map((e, i) => (
              <div key={i} className="flex items-baseline gap-3 text-xs">
                <span className="text-muted-foreground tabular-nums shrink-0">{new Date(e.created_at).toLocaleString(fr ? "fr-CA" : "en-CA")}</span>
                <span>{e.from_status ?? "∅"} → <span className="font-medium">{e.to_status}</span></span>
              </div>
            ))}
            {g.last_seen_at && (
              <p className="text-[11px] text-muted-foreground pt-2 border-t mt-2">
                {fr ? "Vu" : "Seen"} {g.times_seen ?? 1}× · {fr ? "dernière fois" : "last"} {new Date(g.last_seen_at).toLocaleString(fr ? "fr-CA" : "en-CA")}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-4">
          <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-sm underline inline-flex items-center gap-1">
            {t("grants.source")} <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="flex gap-2 flex-wrap">
            {g.status !== "discovered" && (
              <NotebookLMBridge grantId={id} label="Send to NotebookLM" />
            )}
            {g.status === "discovered" && (
              <Button size="sm" variant="outline" disabled={busy === "enrich"} onClick={() => run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }))}>
                {busy === "enrich" ? t("app.loading") : "Fetch details"}
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={busy === "eval"} onClick={() => run("eval", "evaluator", () => evaluate({ data: { grantId: id } }))}>
              {busy === "eval" ? t("app.loading") : (data.evaluation ? (fr ? "Réévaluer" : "Re-evaluate") : t("grants.evaluate"))}
            </Button>
            {traceRun && (
              <Button size="sm" variant="ghost" onClick={() => setTraceRun({ ...traceRun })} title={fr ? "Voir le raisonnement en direct" : "View live reasoning"}>
                <Activity className="h-3.5 w-3.5 mr-1" />
                {fr ? "Voir raisonnement" : "View reasoning"}
              </Button>
            )}
            {(g.status === "scored" || g.status === "shortlisted" || g.status === "in_proposal") && (
              <Button size="sm" disabled={busy === "draft"} onClick={async () => {
                setBusy("draft"); setErr(null);
                try {
                  const r = await strategize({ data: { grantId: id } });
                  if (r.runId) setTraceRun({ runId: r.runId, agent: "strategist" });
                  await navigate({ to: "/proposals/$id", params: { id: r.proposalId } });
                } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                finally { setBusy(null); }
              }}>{busy === "draft" ? t("app.loading") : t("grants.draftProposal")}</Button>
            )}
          </div>
          {g.status !== "discovered" && <OpportunityBriefPanel grantId={id} />}
        </div>
      </section>


      <EvidencePanel
        grantId={id}
        field={evField}
        open={!!evField}
        onOpenChange={(o) => !o && closeEvidence()}
      />
      <AgentTracePanel
        runId={traceRun?.runId ?? null}
        agentLabel={traceRun?.agent ?? ""}
        open={!!traceRun}
        onOpenChange={(o) => !o && closeTrace()}
        fr={!!fr}
        focusStep={search.step ?? null}
        onFocusStep={(step) => patchSearch({ step: step ?? undefined })}
      />

    </main>
  );
}
