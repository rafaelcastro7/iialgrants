// Drill-down page for a single grant - summary, evidence, fit analysis,
// workflow history, and proposal actions.
import { useEffect, useState } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Globe,
  Tag,
} from "lucide-react";
import { runEvaluator } from "@/agents/evaluator.functions";
import { runStrategist } from "@/agents/strategist.functions";
import { AgentTracePanel } from "@/components/grants/AgentTracePanel";
import { GrantDetailExpress, ValueBlock } from "@/components/grants/GrantDetailExpress";
import { EvaluationDetail } from "@/components/grants/EvaluationDetail";
import { EvidenceChip, EvidencePanel } from "@/components/grants/EvidencePanel";
import { FetchTrailPanel } from "@/components/grants/FetchTrailPanel";
import { FitEvaluation } from "@/components/grants/FitEvaluation";
import { FreshnessBadges } from "@/components/grants/FreshnessBadges";
import { NotebookLMBridge } from "@/components/grants/NotebookLMBridge";
import { OpportunityBriefPanel } from "@/components/grants/OpportunityBriefPanel";
import { SelfCheckBanner } from "@/components/grants/SelfCheckBanner";
import { V2GrantDetail } from "@/components/v2/V2GrantDetail";
import { useUiVersion } from "@/components/v2/ui-version";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGrantDetail } from "@/lib/grant-detail.functions";
import { enrichGrant, markGrantsCurated } from "@/lib/grants.functions";
import { createShareLink } from "@/lib/share-report.functions";
import { useIsAdmin } from "@/lib/use-platform";
import "@/i18n";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["grant-detail", id],
    queryFn: () => getGrantDetail({ data: { id } }),
  });

type GrantRequirementRow = {
  category: string;
  requirement: string;
  value?: string;
  isCritical: boolean;
};

type GrantSearch = {
  evidence?: string;
  run?: string;
  agent?: string;
  step?: string;
};

export const Route = createFileRoute("/_authenticated/grants/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Grant ${params.id.slice(0, 8)} - IIAL` }],
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
  const { t } = useTranslation();
  const { version } = useUiVersion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const evaluate = useServerFn(runEvaluator);
  const enrichOne = useServerFn(enrichGrant);
  const strategize = useServerFn(runStrategist);
  const curate = useServerFn(markGrantsCurated);
  const shareLink = useServerFn(createShareLink);
  const { data } = useSuspenseQuery(detailQuery(id));
  const [busy, setBusy] = useState<string | null>(null);
  const isAuditRoute = useRouterState({
    select: (state) => state.location.pathname.endsWith("/audit"),
  });
  // Shares the same toggle key as the grants list so the choice carries over.
  const [viewMode, setViewMode] = useState<"express" | "advanced">(() =>
    typeof window !== "undefined"
      ? ((window.sessionStorage.getItem("grants.viewMode") as "express" | "advanced") ?? "express")
      : "express",
  );
  const switchView = (mode: "express" | "advanced") => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.sessionStorage.setItem("grants.viewMode", mode);
  };
  const [err, setErr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [evField, setEvField] = useState<string | null>(search.evidence ?? null);
  const [traceRun, setTraceRun] = useState<{ runId: string; agent: string } | null>(
    search.run ? { runId: search.run, agent: search.agent ?? "" } : null,
  );

  useEffect(() => {
    setEvField(search.evidence ?? null);
  }, [search.evidence]);

  useEffect(() => {
    if (search.run) setTraceRun({ runId: search.run, agent: search.agent ?? "" });
    else setTraceRun(null);
  }, [search.run, search.agent]);

  const needsEnrich = !data.grant.enriched_at && data.grant.status === "discovered";
  useEffect(() => {
    if (!needsEnrich || busy) return;
    run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }), {
      openTrace: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, needsEnrich]);

  const patchSearch = (patch: Partial<GrantSearch>) =>
    navigate({
      to: "/grants/$id",
      params: { id },
      search: (prev: GrantSearch) => ({ ...prev, ...patch }),
      replace: true,
    });

  const openEvidence = (field: string) => {
    setEvField(field);
    patchSearch({ evidence: field });
  };
  const closeEvidence = () => {
    setEvField(null);
    patchSearch({ evidence: undefined });
  };
  const closeTrace = () => {
    setTraceRun(null);
    patchSearch({ run: undefined, agent: undefined, step: undefined });
  };

  function setTraceFromRun(result: unknown, agent: string, openTrace: boolean) {
    if (!openTrace) return;
    const runId = (result as { runId?: string } | undefined)?.runId;
    if (runId) {
      setTraceRun({ runId, agent });
      patchSearch({ run: runId, agent });
    }
  }

  const g = data.grant as unknown as {
    id: string;
    title: string;
    title_fr: string | null;
    summary: string | null;
    summary_fr: string | null;
    amount_cad_min: number | null;
    amount_cad_max: number | null;
    deadline: string | null;
    sectors: string[] | null;
    eligibility: Record<string, unknown> | null;
    requirements: GrantRequirementRow[] | null;
    language: string;
    url: string;
    status: string;
    fit_score: number | null;
    discovered_at: string | null;
    enriched_at: string | null;
    scored_at: string | null;
    last_seen_at: string | null;
    times_seen: number | null;
    funder: {
      id: string;
      name: string;
      name_fr: string | null;
      jurisdiction: string | null;
      source_url: string | null;
    } | null;
    enrich_last_error?: string | null;
    enrich_attempts?: number | null;
  };
  const title = g.title;
  const summary = g.summary?.trim() || null;
  const funderName = g.funder?.name ?? "-";
  const fmtCurrency = (n: number | null) =>
    n == null
      ? "-"
      : new Intl.NumberFormat("en-CA", {
          style: "currency",
          currency: "CAD",
          maximumFractionDigits: 0,
        }).format(n);

  async function run(
    label: string,
    agent: string,
    fn: () => Promise<unknown>,
    options?: { openTrace?: boolean },
  ) {
    setBusy(label);
    setErr(null);
    try {
      const result = await fn();
      setTraceFromRun(result, agent, options?.openTrace ?? true);
      await qc.invalidateQueries({ queryKey: ["grant-detail", id] });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onShortlist() {
    setBusy("shortlist");
    setErr(null);
    try {
      await curate({ data: { grantIds: [id] } });
      await qc.invalidateQueries({ queryKey: ["grant-detail", id] });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onDraft() {
    setBusy("draft");
    setErr(null);
    try {
      const r = await strategize({ data: { grantId: id } });
      if (r.runId && !r.reused) setTraceRun({ runId: r.runId, agent: "strategist" });
      await navigate({ to: "/proposals/$id", params: { id: r.proposalId } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy("share");
    setErr(null);
    try {
      const { token } = await shareLink({ data: { grantId: id } });
      const url = `${window.location.origin}/report/${token}`;
      await navigator.clipboard.writeText(url);
      setShareUrl(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (isAuditRoute) {
    return <Outlet />;
  }

  if (version === "v2") {
    return (
      <>
        <V2GrantDetail
          busy={busy}
          duplicateGroupSize={data.duplicateGroupSize}
          err={err}
          evaluation={data.evaluation}
          events={data.events}
          existingProposalId={data.existingProposal?.id ?? null}
          grant={g}
          isAdmin={isAdmin}
          shareUrl={shareUrl}
          traceRun={traceRun}
          onDraft={onDraft}
          onEvaluate={() => run("eval", "evaluator", () => evaluate({ data: { grantId: id } }))}
          onFetchDetails={() =>
            run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }))
          }
          onOpenEvidence={openEvidence}
          onShare={onShare}
          onShortlist={onShortlist}
        />
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
          fr={false}
          focusStep={search.step ?? null}
          onFocusStep={(step) => patchSearch({ step: step ?? undefined })}
        />
      </>
    );
  }

  return (
    <main className="min-h-screen text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/grants">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("nav.grants")}
            </Link>
          </Button>
          <div
            className="ml-auto inline-flex rounded-lg border bg-card p-0.5"
            role="tablist"
            aria-label="View mode"
          >
            {(["express", "advanced"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={viewMode === m}
                onClick={() => switchView(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === m
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "express" ? "Express" : "Advanced"}
              </button>
            ))}
          </div>
          {viewMode === "advanced" && (
            <div className="flex flex-wrap items-center gap-2">
              {g.url && (
                <Button asChild size="sm">
                  <a href={g.url} target="_blank" rel="noopener noreferrer">
                    Open funder page
                    <ExternalLink className="ml-1 h-4 w-4" />
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/grants/$id/audit" params={{ id }}>
                  Audit trail
                </Link>
              </Button>
              <Button variant="outline" size="sm" disabled={busy === "share"} onClick={onShare}>
                {busy === "share" ? "Creating..." : shareUrl ? "Link copied" : "Share report"}
              </Button>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {viewMode === "express" && (
          <GrantDetailExpress
            title={title}
            funderName={funderName}
            funderId={g.funder?.id ?? null}
            jurisdiction={g.funder?.jurisdiction ?? null}
            status={g.status}
            summary={summary}
            amountMin={g.amount_cad_min}
            amountMax={g.amount_cad_max}
            deadline={g.deadline}
            sectors={g.sectors}
            eligibility={g.eligibility}
            evaluation={data.evaluation}
            requirements={g.requirements}
            language={g.language}
            discoveredAt={g.discovered_at}
            enrichedAt={g.enriched_at}
            scoredAt={g.scored_at}
            lastSeenAt={g.last_seen_at}
            timesSeen={g.times_seen}
            url={g.url}
            funderUrl={g.funder?.source_url ?? null}
            events={data.events}
            enrichAttempts={g.enrich_attempts}
            enrichLastError={g.enrich_last_error}
            busy={busy}
            existingProposalId={data.existingProposal?.id ?? null}
            duplicateGroupSize={data.duplicateGroupSize}
            onFetchDetails={() =>
              run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }))
            }
            onEvaluate={() => run("eval", "evaluator", () => evaluate({ data: { grantId: id } }))}
            onDraft={onDraft}
            onShowAdvanced={() => switchView("advanced")}
          />
        )}

        {viewMode === "advanced" && (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-2xl leading-tight tracking-tight">{title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Building2 className="mr-1 inline h-3.5 w-3.5" />
                    {funderName}
                    {g.funder?.jurisdiction ? ` | ${g.funder.jurisdiction}` : ""}
                  </p>
                </div>
                <Badge variant={g.status === "shortlisted" ? "default" : "secondary"}>
                  {t(`grants.status.${g.status}`)}
                </Badge>
              </div>
              <FreshnessBadges discoveredAt={g.discovered_at} deadline={g.deadline} fr={false} />
            </div>

            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}

            {busy === "enrich" && (
              <div className="flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/5 px-3 py-2 text-sm">
                <Activity className="h-4 w-4 animate-pulse" />
                Fetching live details from the funder page. This can take 20 to 60 seconds.
              </div>
            )}

            <SelfCheckBanner
              grantId={id}
              retrying={busy === "enrich"}
              onRetry={() => run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }))}
            />

            <FetchTrailPanel
              grantId={id}
              retrying={busy === "enrich"}
              errorMsg={g.enrich_last_error ?? null}
              onRetry={() => run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }))}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    {t("grants.amount")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm tabular-nums">
                  <div>
                    {fmtCurrency(g.amount_cad_min)} to {fmtCurrency(g.amount_cad_max)}
                  </div>
                  {(g.amount_cad_min != null || g.amount_cad_max != null) && (
                    <EvidenceChip
                      field="amount_cad_max"
                      label="View citation"
                      onClick={openEvidence}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {t("grants.deadline")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <div>{g.deadline ?? "-"}</div>
                  {g.deadline && (
                    <EvidenceChip field="deadline" label="View citation" onClick={openEvidence} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" />
                    Language
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm uppercase">{g.language}</CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Grant overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    What this grant is
                  </p>
                  <p className="leading-relaxed text-foreground">
                    {summary ??
                      "A detailed public summary is not available yet. Run enrichment to pull more context from the funder page."}
                  </p>
                </div>

                <div className="space-y-2.5 border-t pt-3">
                  <DetailRow label="Funder" value={funderName} />
                  {g.funder?.jurisdiction && (
                    <DetailRow label="Jurisdiction" value={g.funder.jurisdiction} />
                  )}
                  <DetailRow label="Status" value={t(`grants.status.${g.status}`)} />
                  {g.discovered_at && (
                    <DetailRow label="Discovered" value={fmtDate(g.discovered_at)} />
                  )}
                  {g.enriched_at && <DetailRow label="Enriched" value={fmtDate(g.enriched_at)} />}
                  {g.scored_at && <DetailRow label="Evaluated" value={fmtDate(g.scored_at)} />}
                  {g.times_seen != null && (
                    <DetailRow label="Times seen" value={`${g.times_seen} times`} />
                  )}
                  <div className="gap-2 pt-1 sm:grid sm:grid-cols-[180px_1fr] sm:items-baseline">
                    <span className="font-medium text-muted-foreground">Official links</span>
                    <div className="flex flex-col gap-1.5">
                      {g.url && (
                        <a
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-fit items-center gap-1 underline"
                        >
                          Official grant page
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {g.funder?.source_url && g.funder.source_url !== g.url && (
                        <a
                          href={g.funder.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-fit items-center gap-1 underline"
                        >
                          Funder website
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {g.sectors && g.sectors.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  Sectors
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {g.sectors.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                  <EvidenceChip field="sectors" label="View citations" onClick={openEvidence} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <FitEvaluation
                status={g.status}
                discoveredAt={g.discovered_at}
                enrichedAt={g.enriched_at}
                scoredAt={g.scored_at}
                evaluation={
                  data.evaluation as {
                    fit_score: number;
                    eligibility_pass: boolean;
                    rationale_en: string;
                    rationale_fr: string;
                    created_at: string;
                  } | null
                }
                fr={false}
              />
              {data.evaluation && (
                <div className="flex flex-wrap gap-2 pl-2">
                  <EvidenceChip field="fit_score" label="Why this score?" onClick={openEvidence} />
                  <EvidenceChip
                    field="eligibility_pass"
                    label="Why this eligibility result?"
                    onClick={openEvidence}
                  />
                </div>
              )}
            </div>

            {g.enriched_at && <EvaluationDetail grantId={id} />}

            {Array.isArray(g.requirements) && g.requirements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Application requirements</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    What this funder asks for - prepare these before drafting.
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {(g.requirements as GrantRequirementRow[]).map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Badge
                          variant={r.isCritical ? "destructive" : "secondary"}
                          className="text-[10px] mt-0.5 shrink-0"
                        >
                          {r.isCritical ? "critical" : r.category}
                        </Badge>
                        <div className="min-w-0">
                          <p className="font-medium">{r.requirement}</p>
                          {r.value && (
                            <p
                              className="text-xs text-muted-foreground italic truncate"
                              title={r.value}
                            >
                              "{r.value}"
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {g.eligibility && Object.keys(g.eligibility).length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Eligibility</CardTitle>
                  <EvidenceChip field="eligibility" label="View citations" onClick={openEvidence} />
                </CardHeader>
                <CardContent className="space-y-2.5 text-sm">
                  {Object.entries(g.eligibility).map(([k, v]) => (
                    <div
                      key={k}
                      className="gap-2 sm:grid sm:grid-cols-[180px_1fr] sm:items-baseline"
                    >
                      <span className="font-medium text-muted-foreground">{humanizeKey(k)}</span>
                      <div>
                        <EligibilityValue value={v} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.events.length === 0 && (
                  <p className="text-xs text-muted-foreground">No events recorded yet.</p>
                )}
                {data.events.map((e, i) => (
                  <div key={i} className="flex items-baseline gap-3 text-xs">
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-CA")}
                    </span>
                    <span>
                      {e.from_status ?? "none"} to{" "}
                      <span className="font-medium">{e.to_status}</span>
                    </span>
                  </div>
                ))}
                {g.last_seen_at && (
                  <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                    Seen {g.times_seen ?? 1} time(s) | last seen{" "}
                    {new Date(g.last_seen_at).toLocaleString("en-CA")}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <a
                href={g.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm underline"
              >
                {t("grants.source")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <div className="flex flex-wrap gap-2">
                {g.status !== "discovered" && (
                  <NotebookLMBridge grantId={id} label="Send to NotebookLM" />
                )}
                {g.status === "discovered" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === "enrich"}
                    onClick={() =>
                      run("enrich", "enricher", () => enrichOne({ data: { grantId: id } }))
                    }
                  >
                    {busy === "enrich" ? t("app.loading") : "Fetch details"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === "eval"}
                  onClick={() =>
                    run("eval", "evaluator", () => evaluate({ data: { grantId: id } }))
                  }
                >
                  {busy === "eval"
                    ? t("app.loading")
                    : data.evaluation
                      ? "Re-evaluate"
                      : t("grants.evaluate")}
                </Button>
                {isAdmin && g.status === "scored" && (
                  <Button size="sm" disabled={busy === "shortlist"} onClick={onShortlist}>
                    {busy === "shortlist" ? t("app.loading") : "Shortlist"}
                  </Button>
                )}
                {traceRun && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTraceRun({ ...traceRun })}
                    title="View live reasoning"
                  >
                    <Activity className="mr-1 h-3.5 w-3.5" />
                    View reasoning
                  </Button>
                )}
                {(g.status === "scored" ||
                  g.status === "shortlisted" ||
                  g.status === "in_proposal") &&
                  (data.existingProposal ? (
                    <Button size="sm" asChild>
                      <Link to="/proposals/$id" params={{ id: data.existingProposal.id }}>
                        View proposal
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy === "draft"} onClick={onDraft}>
                      {busy === "draft" ? t("app.loading") : t("grants.draftProposal")}
                    </Button>
                  ))}
              </div>
              {g.status !== "discovered" && <OpportunityBriefPanel grantId={id} />}
            </div>
          </>
        )}
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
        fr={false}
        focusStep={search.step ?? null}
        onFocusStep={(step) => patchSearch({ step: step ?? undefined })}
      />
    </main>
  );
}

function humanizeKey(k: string): string {
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="gap-2 sm:grid sm:grid-cols-[180px_1fr] sm:items-baseline">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EligibilityValue({ value }: { value: unknown }) {
  if (value == null || value === "") {
    return <span className="text-muted-foreground">-</span>;
  }
  if (typeof value === "boolean") {
    return <span>{value ? "Yes" : "No"}</span>;
  }
  if (Array.isArray(value) && value.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  if (Array.isArray(value) || typeof value === "object") {
    // Was a raw JSON.stringify dump here (badges showing literal
    // {"sector":["..."],"territory":["Canada"]}) — the same bug already fixed
    // in GrantDetailExpress.tsx's ValueBlock but never propagated to this
    // sibling Advanced-view formatter. Reuse it instead of a second formatter.
    return <ValueBlock value={value} />;
  }
  return <span>{String(value)}</span>;
}
