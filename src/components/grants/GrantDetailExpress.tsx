import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Flag,
  Globe2,
  Landmark,
  Link2,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { MAX_ENRICH_ATTEMPTS, isTerminalGrantStatus } from "@/agents/pipeline-stages.shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;

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
  created_at?: string | null;
  axis_breakdown?: unknown;
} | null;

type GrantEvent = {
  from_status: string | null;
  to_status: string;
  created_at: string;
  metadata?: unknown;
};

type DeadlineState = {
  label: string;
  detail: string;
  days: number | null;
  tone: "neutral" | "good" | "warning" | "danger";
};

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
  discovered: "The source exists, but the opportunity still needs reliable structured detail.",
  enriched: "Core details were extracted and are ready for a fit decision.",
  scored: "The opportunity has been evaluated against IIAL criteria.",
  shortlisted: "The opportunity is marked for active consideration.",
  in_proposal: "A proposal workflow already exists for this opportunity.",
  submitted: "The proposal has been submitted.",
  won: "The opportunity was awarded.",
  lost: "The opportunity was not awarded.",
  expired: "The opportunity is no longer open.",
  archived: "The opportunity is retained for records only.",
};

const STOPWORDS = new Set([
  "grant",
  "grants",
  "fund",
  "funding",
  "program",
  "programme",
  "support",
  "the",
  "and",
  "for",
  "with",
]);

function formatCad(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function amountLabel(min: number | null, max: number | null, everEnriched: boolean): string {
  if (min != null && max != null)
    return min === max ? formatCad(max) : `${formatCad(min)} to ${formatCad(max)}`;
  if (max != null) return `Up to ${formatCad(max)}`;
  if (min != null) return `From ${formatCad(min)}`;
  // Same ambiguity deadlineState() already hedges for "no fixed deadline"
  // (funder genuinely didn't set one vs. we haven't looked yet) — a flat
  // "Not published" read as a confirmed fact even for a never-enriched grant.
  return everEnriched ? "Not published by funder" : "Not yet extracted";
}

function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime
    ? date.toLocaleString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function deadlineState(deadline: string | null): DeadlineState {
  if (!deadline) {
    return {
      label: "No fixed deadline",
      detail: "Treat as rolling or not yet extracted",
      days: null,
      tone: "neutral",
    };
  }
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return { label: "Unparsed deadline", detail: deadline, days: null, tone: "neutral" };
  }
  const exact = formatDate(deadline);
  const days = Math.ceil((date.getTime() - Date.now()) / DAY_MS);
  if (days < 0) return { label: "Closed", detail: exact, days, tone: "danger" };
  if (days === 0) return { label: "Closes today", detail: exact, days, tone: "danger" };
  if (days <= 14) return { label: `${days} days left`, detail: exact, days, tone: "danger" };
  if (days <= 45) return { label: `${days} days left`, detail: exact, days, tone: "warning" };
  return { label: exact, detail: `${days} days away`, days, tone: "good" };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function labelFromKey(value: string): string {
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return value;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayTag(value: string): string {
  if (!/[_-]/.test(value)) return value;
  return labelFromKey(value);
}

function initialsOf(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function eligibilityRows(eligibility: unknown): Array<[string, unknown]> {
  const parsed = parseMaybeJson(eligibility);
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => [`Criterion ${index + 1}`, parseMaybeJson(item)]);
  }
  return Object.entries(parsed as Record<string, unknown>)
    .map(([key, value]) => [key, parseMaybeJson(value)] as [string, unknown])
    .filter(([, value]) => {
      if (value == null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      // A zero-key object ({}) used to pass this filter as "present" and then
      // render as a silently blank cell in ValueBlock — treat it the same as
      // null/"" (genuinely no content) instead.
      if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value as object).length === 0
      )
        return false;
      return true;
    });
}

function titleTokens(title: string): string[] {
  return Array.from(
    new Set(
      title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
    ),
  );
}

function computeCompleteness({
  summary,
  amountMin,
  amountMax,
  deadline,
  sectors,
  eligibilityRowsCount,
  requirements,
  evaluation,
}: {
  summary: string | null;
  amountMin: number | null;
  amountMax: number | null;
  deadline: string | null;
  sectors?: string[] | null;
  eligibilityRowsCount: number;
  requirements: Requirement[];
  evaluation: Evaluation;
}) {
  const checks = [
    { label: "Summary", ok: !!summary },
    { label: "Funding", ok: amountMin != null || amountMax != null },
    { label: "Deadline", ok: !!deadline },
    { label: "Eligibility", ok: eligibilityRowsCount > 0 },
    { label: "Sectors", ok: !!sectors?.length },
    { label: "Requirements", ok: requirements.length > 0 },
    { label: "Fit", ok: !!evaluation },
  ];
  const known = checks.filter((check) => check.ok).length;
  return { checks, known, total: checks.length, pct: Math.round((known / checks.length) * 100) };
}

function verdictFor({
  status,
  evaluation,
  deadline,
  completenessPct,
  enrichmentFailed,
}: {
  status: string;
  evaluation: Evaluation;
  deadline: DeadlineState;
  completenessPct: number;
  enrichmentFailed: boolean;
}): { label: string; detail: string; tone: "good" | "warning" | "danger" | "neutral" } {
  // submitted/won grants will almost always have a past deadline (you submit
  // before the deadline; the funder decides after it closes) — that's the
  // expected, common-case state, not a reason to brand them "closed / no
  // longer actionable" alongside genuinely dead archived/expired/lost records.
  if (status === "won") {
    return {
      label: "Awarded",
      detail: "The opportunity was awarded. No further pursuit action is needed.",
      tone: "good",
    };
  }
  if (status === "submitted" || status === "in_proposal") {
    return {
      label: status === "submitted" ? "Awaiting funder decision" : "In proposal",
      detail:
        status === "submitted"
          ? "A proposal has been submitted. No further pursuit action is needed until the funder responds."
          : "A proposal is being drafted for this opportunity.",
      tone: "neutral",
    };
  }
  if (isTerminalGrantStatus(status) || (deadline.days != null && deadline.days < 0)) {
    return {
      label: "Do not prioritize",
      detail: "This record is closed, archived, or no longer actionable.",
      tone: "danger",
    };
  }
  if (enrichmentFailed) {
    return {
      label: "Validate source first",
      detail:
        "Automation could not verify the core grant facts. Review the official page before proposal work.",
      tone: "warning",
    };
  }
  if (completenessPct < 55) {
    return {
      label: "Incomplete lead",
      detail:
        "Enough information exists to track the opportunity, but not enough to make a confident pursue/no-pursue decision.",
      tone: "warning",
    };
  }
  if (!evaluation) {
    return {
      label: "Ready for fit check",
      detail: "The record has usable detail. Run the evaluator before allocating proposal time.",
      tone: "neutral",
    };
  }
  const score = evaluation.fit_score;
  if (evaluation.eligibility_pass && score >= 0.7) {
    return {
      label: "Strong pursue",
      detail: "High fit and no eligibility blocker were found. Move into proposal planning.",
      tone: "good",
    };
  }
  if (evaluation.eligibility_pass && score >= 0.45) {
    return {
      label: "Selective pursue",
      detail:
        "Potentially useful if the opportunity maps to a current project or partner commitment.",
      tone: "warning",
    };
  }
  if (!evaluation.eligibility_pass) {
    return {
      label: "Eligibility risk",
      detail: "The evaluator found an eligibility issue. Resolve that before drafting.",
      tone: "danger",
    };
  }
  return {
    label: "Low priority",
    detail: "The fit signal is weak. Keep the record for reference unless strategy changes.",
    tone: "neutral",
  };
}

function toneClass(tone: "good" | "warning" | "danger" | "neutral") {
  switch (tone) {
    case "good":
      return "border-success/30 bg-success/10 text-success";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning";
    case "danger":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function GrantDetailExpress({
  title,
  funderName,
  funderId,
  jurisdiction,
  status,
  summary,
  amountMin,
  amountMax,
  deadline,
  sectors,
  eligibility,
  requirements,
  language,
  discoveredAt,
  enrichedAt,
  scoredAt,
  lastSeenAt,
  timesSeen,
  url,
  funderUrl,
  evaluation,
  events,
  enrichAttempts,
  enrichLastError,
  busy,
  existingProposalId,
  duplicateGroupSize,
  onFetchDetails,
  onEvaluate,
  onDraft,
  onShowAdvanced,
}: {
  title: string;
  funderName: string;
  funderId?: string | null;
  jurisdiction?: string | null;
  status: string;
  summary: string | null;
  amountMin: number | null;
  amountMax: number | null;
  deadline: string | null;
  sectors?: string[] | null;
  eligibility?: unknown;
  requirements: Requirement[] | null;
  language?: string | null;
  discoveredAt?: string | null;
  enrichedAt?: string | null;
  scoredAt?: string | null;
  lastSeenAt?: string | null;
  timesSeen?: number | null;
  url: string;
  funderUrl?: string | null;
  evaluation: Evaluation;
  events?: GrantEvent[];
  enrichAttempts?: number | null;
  enrichLastError?: string | null;
  busy: string | null;
  existingProposalId?: string | null;
  duplicateGroupSize?: number;
  onFetchDetails: () => void;
  onEvaluate: () => void;
  onDraft: () => void;
  onShowAdvanced: () => void;
}) {
  const dl = deadlineState(deadline);
  const reqs = requirements ?? [];
  const criticalReqs = reqs.filter((requirement) => requirement.isCritical);
  const supportingReqs = reqs.filter((requirement) => !requirement.isCritical);
  const rows = eligibilityRows(eligibility);
  const fitScore = evaluation ? Math.round(evaluation.fit_score * 100) : null;
  const enrichmentFailed = status === "discovered" && (enrichAttempts ?? 0) >= MAX_ENRICH_ATTEMPTS;
  const canDraft = ["scored", "shortlisted", "in_proposal"].includes(status);
  const shouldEvaluate = status === "enriched" || status === "scored" || !!evaluation;
  const shouldFetch = status === "discovered" && !enrichmentFailed;
  const completeness = computeCompleteness({
    summary,
    amountMin,
    amountMax,
    deadline,
    sectors,
    eligibilityRowsCount: rows.length,
    requirements: reqs,
    evaluation,
  });
  const verdict = verdictFor({
    status,
    evaluation,
    deadline: dl,
    completenessPct: completeness.pct,
    enrichmentFailed,
  });
  const amount = amountLabel(amountMin, amountMax, status !== "discovered");
  const statusLabel = STATUS_LABEL[status] ?? labelFromKey(status);
  const titleSignal = titleTokens(title).slice(0, 5);
  const timeline = [
    { label: "Discovered", value: discoveredAt, done: !!discoveredAt },
    { label: "Details", value: enrichedAt, done: !!enrichedAt },
    {
      label: "Fit checked",
      value: scoredAt ?? evaluation?.created_at,
      done: !!(scoredAt || evaluation),
    },
    { label: "Proposal", value: null, done: ["in_proposal", "submitted", "won"].includes(status) },
  ];
  const latestEvents = (events ?? []).slice(0, 4);

  return (
    <div className="space-y-5">
      {(duplicateGroupSize ?? 1) > 1 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {duplicateGroupSize} records share this funder and a near-identical title — this may be
            a duplicate discovery. Figures (amount, deadline) can differ between them; verify
            against the official page before relying on this one.
          </p>
        </div>
      )}
      <section className="rounded-lg border bg-card">
        <div className="border-b p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusPill tone={verdict.tone}>{verdict.label}</StatusPill>
                <StatusPill>{statusLabel}</StatusPill>
                <StatusPill>{completeness.pct}% data complete</StatusPill>
              </div>
              <h1 className="max-w-5xl break-words font-display text-2xl leading-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {funderId ? (
                    <Link
                      to="/funders/$funderId"
                      params={{ funderId }}
                      className="font-medium text-primary hover:underline"
                    >
                      {funderName}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{funderName}</span>
                  )}
                </span>
                {jurisdiction && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {jurisdiction}
                  </span>
                )}
                {language && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe2 className="h-4 w-4" />
                    {language.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
              {shouldFetch ? (
                <Button disabled={busy === "enrich"} onClick={onFetchDetails}>
                  {busy === "enrich" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fetching details
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Fetch details
                    </>
                  )}
                </Button>
              ) : shouldEvaluate && !canDraft ? (
                <Button disabled={busy === "eval"} onClick={onEvaluate}>
                  {busy === "eval" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking fit
                    </>
                  ) : (
                    <>
                      <Target className="mr-2 h-4 w-4" />
                      Check fit
                    </>
                  )}
                </Button>
              ) : canDraft && existingProposalId ? (
                <Button asChild>
                  <Link to="/proposals/$id" params={{ id: existingProposalId }}>
                    <FileText className="mr-2 h-4 w-4" />
                    View proposal
                  </Link>
                </Button>
              ) : canDraft ? (
                <Button disabled={busy === "draft"} onClick={onDraft}>
                  {busy === "draft" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting draft
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Draft proposal
                    </>
                  )}
                </Button>
              ) : (
                <Button variant="outline" onClick={onShowAdvanced}>
                  Review diagnostics
                </Button>
              )}
              <Button asChild variant="outline">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Official page
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid border-b lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Decision</p>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">
                {verdict.detail}
              </p>
            </div>
            <LifecycleSteps steps={timeline} />
          </div>

          <div className="border-t bg-muted/20 p-5 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Fit" icon={Target}>
                {fitScore == null ? "Not checked" : `${fitScore}/100`}
              </Metric>
              <Metric label="Eligibility" icon={ShieldCheck}>
                {!evaluation ? "Unknown" : evaluation.eligibility_pass ? "Pass" : "Risk"}
              </Metric>
              <Metric label="Funding" icon={Landmark}>
                {amount}
              </Metric>
              <Metric label="Timing" icon={CalendarDays} tone={dl.tone}>
                {dl.label}
              </Metric>
            </div>
          </div>
        </div>

        {enrichmentFailed && (
          <div className="border-b border-warning/30 bg-warning/10 p-4">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-foreground">Automatic extraction hit its limit.</p>
                <p className="mt-1 leading-6 text-muted-foreground">
                  The record reached {MAX_ENRICH_ATTEMPTS} enrichment attempts. The official source
                  still matters, but the catalog should be treated as incomplete until a person
                  verifies the missing facts.
                </p>
                {enrichLastError && (
                  <p className="mt-2 break-words rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                    {enrichLastError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid divide-y lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <Fact label="Deadline" value={dl.detail} helper={dl.label} tone={dl.tone} />
          <Fact label="Amount" value={amount} helper="CAD, when published" />
          <Fact
            label="Source sightings"
            value={String(timesSeen ?? 1)}
            helper={lastSeenAt ? `Last seen ${formatDate(lastSeenAt)}` : "First sighting"}
          />
          <Fact label="Funder" value={funderName} helper={jurisdiction ?? "Jurisdiction unknown"} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <Panel title="Program brief" icon={FileText}>
            <p className="text-sm leading-7 text-foreground">
              {summary ??
                "No reliable summary has been extracted yet. Use the official page and diagnostics before committing proposal time."}
            </p>
            {titleSignal.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {titleSignal.map((token) => (
                  <Badge key={token} variant="outline" className="font-normal">
                    {token}
                  </Badge>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Grant facts" icon={BarChart3}>
            <SummaryList
              rows={[
                [
                  "Status",
                  `${statusLabel} - ${STATUS_DETAIL[status] ?? "No status note available."}`,
                ],
                ["Funding range", amount],
                ["Deadline", `${dl.label} (${dl.detail})`],
                ["Language", language ? language.toUpperCase() : "Unknown"],
                ["Discovered", formatDate(discoveredAt)],
                ["Details fetched", formatDate(enrichedAt)],
                ["Fit evaluated", formatDate(scoredAt ?? evaluation?.created_at)],
                ["Official URL", url],
              ]}
            />
          </Panel>

          <Panel title="Eligibility and fit" icon={ShieldCheck}>
            <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Fit signal</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">
                  {fitScore == null ? "--" : fitScore}
                  {fitScore != null && (
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  )}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {!evaluation
                    ? "No evaluator result yet."
                    : evaluation.eligibility_pass
                      ? "Eligibility passed in the latest evaluation."
                      : "Eligibility risk flagged in the latest evaluation."}
                </p>
              </div>
              <div className="space-y-4">
                {evaluation?.rationale_en && (
                  <p className="text-sm leading-7 text-foreground">{evaluation.rationale_en}</p>
                )}
                {rows.length > 0 ? (
                  <div>
                    {/* Disambiguates against the rationale above: these checks
                        describe categories the FUNDER declared eligible for this
                        grant, not a confirmation that this org matches them — the
                        evaluator's rationale (e.g. "cannot confirm AI/ML focus")
                        is a separate, org-specific judgment call. Without this
                        caption a green "Yes" here reads as contradicting a
                        rationale that just said it couldn't confirm the same
                        criterion. */}
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Eligible categories declared by the funder — not a personalized match
                    </p>
                    <div className="divide-y rounded-lg border">
                      {rows.map(([label, value]) => (
                        <EligibilityLine key={label} label={label} value={value} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState>
                    Eligibility is not structured yet. Validate applicant type, geography, sector,
                    and any cost-share rule from the source page.
                  </EmptyState>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Application package" icon={FileCheck2}>
            {reqs.length > 0 ? (
              <div className="space-y-5">
                {criticalReqs.length > 0 && (
                  <RequirementList label="Critical requirements" items={criticalReqs} critical />
                )}
                {supportingReqs.length > 0 && (
                  <RequirementList label="Supporting requirements" items={supportingReqs} />
                )}
              </div>
            ) : (
              <EmptyState>
                No application requirements have been extracted. Check the official opportunity for
                forms, budget documents, matching funds, reporting duties, and submission portal.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Focus areas" icon={Flag}>
            {sectors && sectors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sectors.map((sector) => (
                  <Badge key={sector} variant="secondary" className="font-normal">
                    {displayTag(sector)}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyState>No sectors have been extracted yet.</EmptyState>
            )}
          </Panel>
        </main>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Data quality" icon={CheckCircle2}>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Completeness</span>
                  <span className="tabular-nums">
                    {completeness.known}/{completeness.total}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${completeness.pct}%` }} />
                </div>
              </div>
              <div className="space-y-2">
                {completeness.checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 text-sm">
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={check.ok ? "text-foreground" : "text-muted-foreground"}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Source" icon={Link2}>
            <div className="space-y-3 text-sm">
              <SourceLink href={url}>Official grant page</SourceLink>
              {funderUrl && funderUrl !== url && (
                <SourceLink href={funderUrl}>Funder website</SourceLink>
              )}
              <SummaryList
                compact
                rows={[
                  ["Discovered", formatDate(discoveredAt)],
                  ["Last seen", formatDate(lastSeenAt)],
                  ["Times seen", String(timesSeen ?? 1)],
                  ["Attempts", String(enrichAttempts ?? 0)],
                ]}
              />
              <Button className="w-full" variant="outline" onClick={onShowAdvanced}>
                Evidence and trace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Panel>

          <Panel title="Timeline" icon={Clock3}>
            {latestEvents.length > 0 ? (
              <ol className="space-y-3">
                {latestEvents.map((event, index) => (
                  <li key={`${event.created_at}-${index}`} className="flex gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span>
                      <span className="font-medium">
                        {STATUS_LABEL[event.to_status] ?? labelFromKey(event.to_status)}
                      </span>
                      {event.from_status && (
                        <span className="text-muted-foreground">
                          {" "}
                          from {STATUS_LABEL[event.from_status] ?? labelFromKey(event.from_status)}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(event.created_at, true)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState>No workflow events recorded yet.</EmptyState>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "warning" | "danger" | "neutral";
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold ${toneClass(tone)}`}
    >
      {children}
    </span>
  );
}

function Metric({
  label,
  icon: Icon,
  children,
  tone = "neutral",
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div
        className={`mt-2 break-words text-base font-semibold leading-snug ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  return (
    <div className="min-w-0 p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-2 break-words text-sm font-semibold ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : ""}`}
      >
        {value}
      </p>
      {helper && <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>}
    </div>
  );
}

function LifecycleSteps({
  steps,
}: {
  steps: Array<{ label: string; value: string | null | undefined; done: boolean }>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {steps.map((step) => (
        <div key={step.label} className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{step.label}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {step.value ? formatDate(step.value) : step.done ? "Complete" : "Pending"}
          </p>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function SummaryList({
  rows,
  compact = false,
}: {
  rows: Array<[string, ReactNode]>;
  compact?: boolean;
}) {
  return (
    <dl className="divide-y rounded-lg border">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className={`grid gap-2 px-3 py-3 sm:grid-cols-[160px_minmax(0,1fr)] ${compact ? "text-xs" : "text-sm"}`}
        >
          <dt className="font-medium text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-sm leading-6 text-muted-foreground">
      {children}
    </p>
  );
}

function EligibilityLine({ label, value }: { label: string; value: unknown }) {
  const parsed = parseMaybeJson(value);
  const yes = parsed === true || parsed === "yes" || parsed === "Yes";
  const no = parsed === false || parsed === "no" || parsed === "No";
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_minmax(0,1fr)]">
      <div className="flex items-center gap-2">
        {yes ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : no ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{labelFromKey(label)}</span>
      </div>
      <div className="min-w-0">
        {yes || no ? (
          <span className="text-sm text-muted-foreground">{yes ? "Yes" : "No"}</span>
        ) : (
          <ValueBlock value={parsed} />
        )}
      </div>
    </div>
  );
}

export function ValueBlock({ value }: { value: unknown }) {
  if (value == null || value === "")
    return <span className="text-sm text-muted-foreground">Not specified</span>;
  if (Array.isArray(value)) {
    // Object items (e.g. eligibility.items = [{sector: [...], territory: [...]}],
    // real shape seen on the PSCE grant) need the same key/value formatting as
    // a top-level object below — not a raw JSON dump in a badge, which used to
    // render literal `{"sector":["..."],"territory":["Canada"]}` to the user.
    const hasObjectItems = value.some(
      (item) => item != null && typeof item === "object" && !Array.isArray(item),
    );
    if (hasObjectItems) {
      return (
        <div className="space-y-2">
          {value.map((item, index) => (
            <div key={index} className="rounded-md border bg-muted/20 p-2">
              <ValueBlock value={item} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, index) => (
          <Badge key={index} variant="outline" className="font-normal">
            {String(item)}
          </Badge>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="space-y-1 text-sm">
        {Object.entries(value as Record<string, unknown>).map(([key, rowValue]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[140px_1fr]">
            <span className="font-medium text-muted-foreground">{labelFromKey(key)}</span>
            <span className="break-words">
              {Array.isArray(rowValue) ? rowValue.join(", ") : String(rowValue)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <p className="break-words text-sm leading-6 text-foreground">{String(value)}</p>;
}

function RequirementList({
  label,
  items,
  critical = false,
}: {
  label: string;
  items: Requirement[];
  critical?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item.requirement}-${index}`} className="rounded-lg border bg-background p-3">
            <div className="flex gap-2">
              {critical ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium leading-6">{item.requirement}</p>
                <p className="mt-1 text-xs text-muted-foreground">{labelFromKey(item.category)}</p>
                {item.value && (
                  <p className="mt-2 break-words rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                    {item.value}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 font-medium text-primary hover:bg-muted/40"
    >
      <span className="min-w-0 break-words">{children}</span>
      <ExternalLink className="h-4 w-4 shrink-0" />
    </a>
  );
}
