import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  Gauge,
  Globe2,
  History,
  Landmark,
  Layers3,
  Link2,
  ListChecks,
  Loader2,
  MapPin,
  NotebookText,
  RefreshCw,
  SearchCheck,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { MAX_ENRICH_ATTEMPTS, isTerminalGrantStatus } from "@/agents/pipeline-stages.shared";
import { EvaluationDetail } from "@/components/grants/EvaluationDetail";
import { EvidenceChip } from "@/components/grants/EvidencePanel";
import { FetchTrailPanel } from "@/components/grants/FetchTrailPanel";
import { FitEvaluation } from "@/components/grants/FitEvaluation";
import { NotebookLMBridge } from "@/components/grants/NotebookLMBridge";
import { OpportunityBriefPanel } from "@/components/grants/OpportunityBriefPanel";
import { SelfCheckBanner } from "@/components/grants/SelfCheckBanner";
import { ValueBlock } from "@/components/grants/GrantDetailExpress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Requirement = {
  category: string;
  requirement: string;
  value?: string;
  isCritical: boolean;
};

type Evaluation = {
  fit_score: number;
  eligibility_pass: boolean;
  rationale_en: string;
  rationale_fr?: string | null;
  created_at: string;
  axis_breakdown?: unknown;
} | null;

type GrantEvent = {
  from_status: string | null;
  to_status: string;
  created_at: string;
  metadata?: unknown;
};

type Grant = {
  id: string;
  title: string;
  summary: string | null;
  amount_cad_min: number | null;
  amount_cad_max: number | null;
  deadline: string | null;
  sectors: string[] | null;
  eligibility: Record<string, unknown> | null;
  requirements: Requirement[] | null;
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

type Props = {
  busy: string | null;
  duplicateGroupSize?: number;
  err: string | null;
  evaluation: Evaluation;
  events: GrantEvent[];
  existingProposalId?: string | null;
  grant: Grant;
  isAdmin: boolean;
  shareUrl: string | null;
  traceRun: { runId: string; agent: string } | null;
  onDraft: () => void;
  onEvaluate: () => void;
  onFetchDetails: () => void;
  onOpenEvidence: (field: string) => void;
  onShare: () => void;
  onShortlist: () => void;
};

const DAY_MS = 86_400_000;

const STATUS_LABEL: Record<string, string> = {
  discovered: "Discovered",
  enriched: "Details fetched",
  scored: "Fit checked",
  shortlisted: "Shortlisted",
  in_proposal: "In proposal",
  submitted: "Submitted",
  won: "Won",
  lost: "Not awarded",
  expired: "Expired",
  archived: "Archived",
};

const STATUS_DETAIL: Record<string, string> = {
  discovered: "Official source found; structured facts still need verification.",
  enriched: "Core details are normalized and ready for a fit decision.",
  scored: "The opportunity has an IIAL fit evaluation.",
  shortlisted: "This grant is in active consideration.",
  in_proposal: "A proposal workflow is already attached.",
  submitted: "The proposal is with the funder.",
  won: "Awarded opportunity.",
  lost: "Not awarded.",
  expired: "Past deadline.",
  archived: "Retained for records.",
};

export function V2GrantDetail({
  busy,
  duplicateGroupSize = 1,
  err,
  evaluation,
  events,
  existingProposalId,
  grant,
  isAdmin,
  shareUrl,
  traceRun,
  onDraft,
  onEvaluate,
  onFetchDetails,
  onOpenEvidence,
  onShare,
  onShortlist,
}: Props) {
  const funderName = grant.funder?.name ?? "Unknown funder";
  const requirements = grant.requirements ?? [];
  const criticalRequirements = requirements.filter((item) => item.isCritical);
  const eligibilityRows = grant.eligibility ? Object.entries(grant.eligibility) : [];
  const fitScore = evaluation ? Math.round(evaluation.fit_score * 100) : null;
  const deadline = getDeadlineState(grant.deadline);
  const amount = amountLabel(
    grant.amount_cad_min,
    grant.amount_cad_max,
    grant.status !== "discovered",
  );
  const quality = getQualityState({ grant, evaluation, requirements, eligibilityRows });
  const verdict = getVerdict({
    deadlineDays: deadline.days,
    evaluation,
    qualityPct: quality.pct,
    status: grant.status,
    enrichAttempts: grant.enrich_attempts,
  });
  const canFetch = grant.status === "discovered" && !verdict.enrichmentFailed;
  const canEvaluate = grant.status !== "discovered" || !!evaluation;
  const canDraft = ["scored", "shortlisted", "in_proposal"].includes(grant.status);
  const actionDisabled = busy != null;
  const hasBriefingTools =
    grant.status !== "discovered" || (isAdmin && grant.status === "scored") || !!traceRun;

  return (
    <section className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/grants">
            <ArrowLeft className="h-4 w-4" />
            Grant radar
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/grants/$id/audit" params={{ id: grant.id }}>
              <History className="h-4 w-4" />
              Audit
            </Link>
          </Button>
          {grant.url && (
            <Button asChild size="sm" className="gap-2">
              <a href={grant.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Official page
              </a>
            </Button>
          )}
        </div>
      </div>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-md border bg-card shadow-sm">
          <div className="grid min-h-[360px] lg:grid-cols-[minmax(0,1.2fr)_330px]">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 rounded-md px-2.5 py-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", verdict.dot)} />
                  {verdict.label}
                </Badge>
                <Badge variant="secondary" className="rounded-md">
                  {STATUS_LABEL[grant.status] ?? humanizeKey(grant.status)}
                </Badge>
                {duplicateGroupSize > 1 && (
                  <Badge variant="outline" className="rounded-md text-amber-700">
                    {duplicateGroupSize} similar records
                  </Badge>
                )}
              </div>

              <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl">
                {grant.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Landmark className="h-4 w-4" />
                  {funderName}
                </span>
                {grant.funder?.jurisdiction && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {grant.funder.jurisdiction}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 uppercase">
                  <Globe2 className="h-4 w-4" />
                  {grant.language}
                </span>
              </div>

              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {grant.summary?.trim() ||
                  "A reliable summary is not available yet. Fetch details to pull more context from the official funder page."}
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <SignalTile icon={DollarSign} label="Funding" value={amount} />
                <SignalTile
                  icon={CalendarClock}
                  label="Deadline"
                  value={deadline.label}
                  detail={deadline.detail}
                />
                <SignalTile
                  icon={fitScore == null ? Gauge : BarChart3}
                  label="Fit"
                  value={fitScore == null ? "Not scored" : `${fitScore}/100`}
                  detail={
                    evaluation
                      ? evaluation.eligibility_pass
                        ? "Eligible"
                        : "Eligibility risk"
                      : "Run evaluator"
                  }
                  tone={
                    evaluation?.eligibility_pass
                      ? "success"
                      : fitScore == null
                        ? "neutral"
                        : "danger"
                  }
                />
              </div>
            </div>

            <aside className="border-t bg-muted/35 p-5 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                    Decision brief
                  </div>
                  <div className="mt-1 text-lg font-semibold leading-snug">{verdict.label}</div>
                </div>
                <Sparkles className="h-5 w-5 text-brand" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{verdict.detail}</p>

              <div className="mt-5 space-y-2">
                {canFetch && (
                  <Button
                    className="w-full gap-2"
                    disabled={actionDisabled}
                    onClick={onFetchDetails}
                  >
                    {busy === "enrich" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Fetch details
                  </Button>
                )}
                <Button
                  className="w-full gap-2"
                  variant={canFetch ? "outline" : "default"}
                  disabled={actionDisabled || !canEvaluate}
                  onClick={onEvaluate}
                >
                  {busy === "eval" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SearchCheck className="h-4 w-4" />
                  )}
                  {evaluation ? "Re-evaluate fit" : "Check fit"}
                </Button>
                {existingProposalId ? (
                  <Button asChild className="w-full gap-2">
                    <Link to="/proposals/$id" params={{ id: existingProposalId }}>
                      <FileText className="h-4 w-4" />
                      Open proposal
                    </Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2"
                    disabled={actionDisabled || !canDraft}
                    onClick={onDraft}
                  >
                    {busy === "draft" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Draft proposal
                  </Button>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                <QualityMini label="Completeness" value={`${quality.pct}%`} />
                <QualityMini label="Evidence fields" value={`${quality.known}/${quality.total}`} />
              </div>
            </aside>
          </div>
        </div>

        <aside className="rounded-md border border-white/12 bg-[oklch(0.2_0.026_218)] p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-teal-200" />
            Local decision record
          </div>
          <p className="mt-3 text-sm leading-6 text-white/68">
            Every action on this grant stays tied to local Supabase records, RLS, evidence spans,
            and agent run traces.
          </p>
          <div className="mt-5 space-y-2 text-xs">
            <DarkFact icon={Fingerprint} label="Grant ID" value={grant.id} mono />
            <DarkFact
              icon={Clock3}
              label="Discovered"
              value={formatDateTime(grant.discovered_at)}
            />
            <DarkFact icon={Layers3} label="Last seen" value={formatDateTime(grant.last_seen_at)} />
            <DarkFact icon={Activity} label="Times seen" value={`${grant.times_seen ?? 1}`} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/15 bg-white/[0.06] text-white hover:bg-white/10 hover:text-white"
              disabled={busy === "share"}
              onClick={onShare}
            >
              <Link2 className="h-4 w-4" />
              {busy === "share" ? "Creating" : shareUrl ? "Copied" : "Share"}
            </Button>
            {grant.status !== "discovered" && (
              <NotebookLMBridge grantId={grant.id} label="Notebook" />
            )}
          </div>
        </aside>
      </section>

      {err && (
        <section className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </section>
      )}

      {busy === "enrich" && (
        <section className="flex items-center gap-2 rounded-md border border-teal-500/40 bg-teal-500/5 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Fetching live details from the funder page. This can take 20 to 60 seconds.
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-3">
            <SectionHeading
              actions={
                evaluation ? (
                  <EvidenceChip field="fit_score" label="Score evidence" onClick={onOpenEvidence} />
                ) : undefined
              }
              description="The action recommendation, score, and rationale generated for this organization."
              icon={ClipboardCheck}
              title="Fit and eligibility"
            />
            <FitEvaluation
              status={grant.status}
              discoveredAt={grant.discovered_at}
              enrichedAt={grant.enriched_at}
              scoredAt={grant.scored_at}
              evaluation={
                evaluation
                  ? {
                      fit_score: evaluation.fit_score,
                      eligibility_pass: evaluation.eligibility_pass,
                      rationale_en: evaluation.rationale_en,
                      rationale_fr: evaluation.rationale_fr ?? "",
                      created_at: evaluation.created_at,
                    }
                  : null
              }
              fr={false}
            />
          </section>

          {grant.enriched_at && <EvaluationDetail grantId={grant.id} />}

          <Panel
            icon={FileCheck2}
            title="Application requirements"
            description="Critical asks first, then supporting requirements."
            actions={
              requirements.length > 0 ? (
                <EvidenceChip
                  field="requirements"
                  label="Requirement evidence"
                  onClick={onOpenEvidence}
                />
              ) : undefined
            }
          >
            {requirements.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No structured requirements yet"
                body="Fetch details or review the official page before assigning proposal work."
              />
            ) : (
              <div className="space-y-3">
                {criticalRequirements.length > 0 && (
                  <RequirementGroup title="Critical" requirements={criticalRequirements} />
                )}
                <RequirementGroup
                  title="Supporting"
                  requirements={requirements.filter((item) => !item.isCritical)}
                />
              </div>
            )}
          </Panel>

          <Panel
            icon={ShieldCheck}
            title="Eligibility evidence"
            description="Parsed eligibility fields from the funder source."
            actions={
              eligibilityRows.length > 0 ? (
                <EvidenceChip
                  field="eligibility"
                  label="Eligibility evidence"
                  onClick={onOpenEvidence}
                />
              ) : undefined
            }
          >
            {eligibilityRows.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="Eligibility is not structured yet"
                body="This record may still be a lead. Pull more source context before pursuing."
              />
            ) : (
              <dl className="grid gap-2">
                {eligibilityRows.map(([key, value]) => (
                  <div key={key} className="rounded-md border bg-background/70 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                      {humanizeKey(key)}
                    </dt>
                    <dd className="mt-1 text-sm">
                      <ValueBlock value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>

          <Panel
            icon={Tags}
            title="Sectors and fit signals"
            description="Themes used for discovery, matching, and search."
            actions={
              grant.sectors?.length ? (
                <EvidenceChip field="sectors" label="Sector evidence" onClick={onOpenEvidence} />
              ) : undefined
            }
          >
            <div className="flex flex-wrap gap-2">
              {grant.sectors?.length ? (
                grant.sectors.map((sector) => (
                  <Badge key={sector} variant="secondary" className="rounded-md">
                    {displayTag(sector)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No sectors extracted yet.</span>
              )}
            </div>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel
            icon={Gauge}
            title="Data quality"
            description="Whether this record has enough grounded detail for a decision."
          >
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Completeness</span>
                  <span className="tabular-nums">{quality.pct}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${quality.pct}%` }}
                  />
                </div>
              </div>
              <ul className="space-y-2 text-sm">
                {quality.checks.map((check) => (
                  <li key={check.label} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{check.label}</span>
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel icon={Link2} title="Official sources" description="User-facing source links.">
            <div className="space-y-2 text-sm">
              {grant.url && <SourceLink href={grant.url} label="Grant page" />}
              {grant.funder?.source_url && grant.funder.source_url !== grant.url && (
                <SourceLink href={grant.funder.source_url} label="Funder website" />
              )}
              {!grant.url && !grant.funder?.source_url && (
                <p className="text-muted-foreground">No official URL stored.</p>
              )}
            </div>
          </Panel>

          <Panel
            icon={History}
            title="Lifecycle history"
            description="Latest grant status changes."
          >
            {events.length === 0 ? (
              <EmptyState
                icon={History}
                title="No status events"
                body="Events will appear as enrichment, evaluation, and proposal work happens."
              />
            ) : (
              <ol className="space-y-3">
                {events.slice(0, 8).map((event, index) => (
                  <li key={`${event.created_at}-${index}`} className="flex gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {event.from_status ?? "none"} to {event.to_status}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <SelfCheckBanner
            grantId={grant.id}
            retrying={busy === "enrich"}
            onRetry={onFetchDetails}
          />
          <FetchTrailPanel
            grantId={grant.id}
            retrying={busy === "enrich"}
            errorMsg={grant.enrich_last_error ?? null}
            onRetry={onFetchDetails}
          />

          <Panel icon={NotebookText} title="Briefing tools" description="Human review outputs.">
            {hasBriefingTools ? (
              <div className="flex flex-wrap gap-2">
                {grant.status !== "discovered" && <OpportunityBriefPanel grantId={grant.id} />}
                {isAdmin && grant.status === "scored" && (
                  <Button size="sm" disabled={busy === "shortlist"} onClick={onShortlist}>
                    Shortlist
                  </Button>
                )}
                {traceRun && (
                  <Badge variant="outline" className="rounded-md">
                    Trace ready: {traceRun.agent || "agent"}
                  </Badge>
                )}
              </div>
            ) : (
              <EmptyState
                icon={NotebookText}
                title="Briefing tools unlock after verification"
                body="Fetch reliable details or resolve the source issue before generating proposal briefs."
              />
            )}
          </Panel>
        </aside>
      </section>
    </section>
  );
}

function Panel({
  actions,
  children,
  description,
  icon: Icon,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="rounded-md border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SectionHeading({
  actions,
  description,
  icon: Icon,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-card text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

function SignalTile({
  detail,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  detail?: string;
  icon: LucideIcon;
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-rose-600"
          : "text-primary";
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <div className={cn("mt-2 text-xl font-semibold leading-snug", toneClass)}>{value}</div>
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function QualityMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DarkFact({
  icon: Icon,
  label,
  mono = false,
  value,
}: {
  icon: LucideIcon;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.06] p-3">
      <div className="flex items-center gap-1.5 text-white/42">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn("mt-1 truncate font-semibold text-white", mono && "font-mono text-[11px]")}
      >
        {value}
      </div>
    </div>
  );
}

function RequirementGroup({ requirements, title }: { requirements: Requirement[]; title: string }) {
  if (requirements.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-2 divide-y rounded-md border">
        {requirements.map((requirement, index) => (
          <li key={`${requirement.category}-${index}`} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={requirement.isCritical ? "destructive" : "secondary"}
                className="rounded-md text-[10px]"
              >
                {requirement.isCritical ? "critical" : requirement.category}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium leading-6">{requirement.requirement}</p>
            {requirement.value && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{requirement.value}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2 transition-colors hover:bg-accent"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

function EmptyState({
  body,
  icon: Icon,
  title,
}: {
  body: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/25 p-5 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function getDeadlineState(deadline: string | null) {
  if (!deadline) {
    return {
      label: "No fixed deadline",
      detail: "Rolling or not extracted",
      days: null as number | null,
    };
  }
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return { label: "Unparsed deadline", detail: deadline, days: null as number | null };
  }
  const days = Math.ceil((date.getTime() - Date.now()) / DAY_MS);
  if (days < 0) return { label: "Closed", detail: formatDate(deadline), days };
  if (days === 0) return { label: "Closes today", detail: formatDate(deadline), days };
  return { label: `${days} days`, detail: formatDate(deadline), days };
}

function getQualityState({
  evaluation,
  grant,
  eligibilityRows,
  requirements,
}: {
  evaluation: Evaluation;
  grant: Grant;
  eligibilityRows: [string, unknown][];
  requirements: Requirement[];
}) {
  const checks = [
    { label: "Summary", ok: !!grant.summary?.trim() },
    { label: "Funding", ok: grant.amount_cad_min != null || grant.amount_cad_max != null },
    { label: "Deadline", ok: !!grant.deadline },
    { label: "Eligibility", ok: eligibilityRows.length > 0 },
    { label: "Sectors", ok: !!grant.sectors?.length },
    { label: "Requirements", ok: requirements.length > 0 },
    { label: "Fit evaluation", ok: !!evaluation },
  ];
  const known = checks.filter((check) => check.ok).length;
  return { checks, known, total: checks.length, pct: Math.round((known / checks.length) * 100) };
}

function getVerdict({
  deadlineDays,
  enrichAttempts,
  evaluation,
  qualityPct,
  status,
}: {
  deadlineDays: number | null;
  enrichAttempts?: number | null;
  evaluation: Evaluation;
  qualityPct: number;
  status: string;
}) {
  const enrichmentFailed = status === "discovered" && (enrichAttempts ?? 0) >= MAX_ENRICH_ATTEMPTS;
  if (status === "won") {
    return {
      dot: "bg-emerald-500",
      enrichmentFailed,
      label: "Awarded",
      detail: "This opportunity was won. Use it for reporting, renewal, and evidence history.",
    };
  }
  if (status === "submitted" || status === "in_proposal") {
    return {
      dot: "bg-teal-500",
      enrichmentFailed,
      label: status === "submitted" ? "Awaiting decision" : "Drafting in progress",
      detail: STATUS_DETAIL[status],
    };
  }
  if (isTerminalGrantStatus(status) || (deadlineDays != null && deadlineDays < 0)) {
    return {
      dot: "bg-rose-500",
      enrichmentFailed,
      label: "Do not prioritize",
      detail: "This record is closed, archived, or no longer actionable for new proposal work.",
    };
  }
  if (enrichmentFailed) {
    return {
      dot: "bg-amber-500",
      enrichmentFailed,
      label: "Validate source first",
      detail:
        "Automation could not verify enough structured facts. Review the official page before proposal work.",
    };
  }
  if (qualityPct < 55) {
    return {
      dot: "bg-amber-500",
      enrichmentFailed,
      label: "Incomplete lead",
      detail:
        "Useful for tracking, but not yet strong enough for a confident pursue/no-pursue decision.",
    };
  }
  if (!evaluation) {
    return {
      dot: "bg-teal-500",
      enrichmentFailed,
      label: "Ready for fit check",
      detail: "The record has usable detail. Run the evaluator before assigning proposal time.",
    };
  }
  if (evaluation.eligibility_pass && evaluation.fit_score >= 0.7) {
    return {
      dot: "bg-emerald-500",
      enrichmentFailed,
      label: "Strong pursue",
      detail: "High fit and no eligibility blocker were found. Move into proposal planning.",
    };
  }
  if (evaluation.eligibility_pass && evaluation.fit_score >= 0.45) {
    return {
      dot: "bg-amber-500",
      enrichmentFailed,
      label: "Selective pursue",
      detail: "Potentially useful if it maps to an active project or partner commitment.",
    };
  }
  return {
    dot: "bg-rose-500",
    enrichmentFailed,
    label: evaluation.eligibility_pass ? "Low priority" : "Eligibility risk",
    detail: evaluation.eligibility_pass
      ? "The fit signal is weak. Keep the record for reference unless strategy changes."
      : "The evaluator found an eligibility issue. Resolve that before drafting.",
  };
}

function amountLabel(min: number | null, max: number | null, everEnriched: boolean): string {
  if (min != null && max != null)
    return min === max ? formatCad(max) : `${formatCad(min)} to ${formatCad(max)}`;
  if (max != null) return `Up to ${formatCad(max)}`;
  if (min != null) return `From ${formatCad(min)}`;
  return everEnriched ? "Not published" : "Not extracted";
}

function formatCad(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function humanizeKey(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayTag(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .replace(/\bSme\b/g, "SME");
}
