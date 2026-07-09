import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Landmark,
  Layers3,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { MAX_ENRICH_ATTEMPTS } from "@/agents/pipeline-stages.shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;

type Requirement = {
  category: string;
  requirement: string;
  isCritical: boolean;
};

type Evaluation = {
  fit_score: number;
  eligibility_pass: boolean;
  rationale_en: string;
} | null;

type DeadlineState = {
  label: string;
  detail: string;
  days: number | null;
  tone: "neutral" | "good" | "warning" | "danger";
};

const STATUS_LABEL: Record<string, string> = {
  discovered: "Discovered",
  enriched: "Enriched",
  scored: "Scored",
  shortlisted: "Shortlisted",
  in_proposal: "In proposal",
  submitted: "Submitted",
  won: "Won",
  lost: "Not awarded",
  expired: "Expired",
  archived: "Archived",
};

const ACRONYMS: Record<string, string> = {
  ai: "AI",
  api: "API",
  cra: "CRA",
  gst: "GST",
  hst: "HST",
  id: "ID",
  ip: "IP",
  ml: "ML",
  ngo: "NGO",
  rd: "R&D",
  sme: "SME",
  url: "URL",
};

function fmtCad(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function amountLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${fmtCad(min)} - ${fmtCad(max)}`;
  if (max != null) return `Up to ${fmtCad(max)}`;
  if (min != null) return `From ${fmtCad(min)}`;
  return "Not published";
}

function deadlineState(deadline: string | null): DeadlineState {
  if (!deadline) {
    return { label: "Rolling", detail: "No fixed deadline published", days: null, tone: "neutral" };
  }
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) {
    return {
      label: "Rolling",
      detail: "Deadline could not be parsed",
      days: null,
      tone: "neutral",
    };
  }
  const exact = d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const days = Math.ceil((d.getTime() - Date.now()) / DAY_MS);
  if (days < 0) return { label: "Closed", detail: exact, days, tone: "danger" };
  if (days === 0) return { label: "Closes today", detail: exact, days, tone: "danger" };
  if (days <= 7)
    return {
      label: `${days} day${days === 1 ? "" : "s"} left`,
      detail: exact,
      days,
      tone: "danger",
    };
  if (days <= 30) return { label: `${days} days left`, detail: exact, days, tone: "warning" };
  return { label: exact, detail: `${days} days away`, days, tone: "good" };
}

function humanize(value: string): string {
  const words = value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => ACRONYMS[part.toLowerCase()] ?? part.replace(/\b\w/g, (c) => c.toUpperCase()));
  // Join runs of consecutive acronyms with a slash so "ai_ml" reads "AI/ML",
  // not "AI ML"; ordinary words keep spaces.
  return words
    .map((w, i) => {
      const prevAcronym = i > 0 && /^[A-Z&]+$/.test(words[i - 1]);
      const thisAcronym = /^[A-Z&]+$/.test(w);
      return (i > 0 ? (prevAcronym && thisAcronym ? "/" : " ") : "") + w;
    })
    .join("");
}

function initialsOf(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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

function eligibilityRows(eligibility: unknown): Array<[string, unknown]> {
  const parsed = parseMaybeJson(eligibility);
  if (!parsed || typeof parsed !== "object") return [];
  const value =
    !Array.isArray(parsed) &&
    Object.keys(parsed as Record<string, unknown>).length === 1 &&
    "items" in (parsed as Record<string, unknown>)
      ? parseMaybeJson((parsed as Record<string, unknown>).items)
      : parsed;
  if (!value || typeof value !== "object") return [];
  const rows = Array.isArray(value)
    ? value.map(
        (item, index) => [`Criterion ${index + 1}`, parseMaybeJson(item)] as [string, unknown],
      )
    : Object.entries(value as Record<string, unknown>).map(
        ([key, rowValue]) => [key, parseMaybeJson(rowValue)] as [string, unknown],
      );
  return rows.filter(([, rowValue]) => {
    if (rowValue == null || rowValue === "") return false;
    if (Array.isArray(rowValue) && rowValue.length === 0) return false;
    return true;
  });
}

function strategicVerdict({
  evaluation,
  deadline,
  status,
  lowData,
}: {
  evaluation: Evaluation;
  deadline: DeadlineState;
  status: string;
  lowData: boolean;
}): { label: string; detail: string; tone: "good" | "warning" | "danger" | "neutral" } {
  if (
    ["archived", "expired", "lost"].includes(status) ||
    (deadline.days != null && deadline.days < 0)
  ) {
    return {
      label: "Do not prioritize",
      detail:
        "This opportunity is closed or no longer active. Keep it for records unless a new intake opens.",
      tone: "danger",
    };
  }
  if (lowData) {
    return {
      label: "Validate first",
      detail:
        "The catalog does not have enough reliable detail yet. Confirm eligibility and requirements before investing proposal time.",
      tone: "warning",
    };
  }
  if (!evaluation) {
    return {
      label: "Check fit",
      detail:
        "Run the evaluator to compare this opportunity against IIAL before deciding whether to pursue it.",
      tone: "warning",
    };
  }
  const score = evaluation.fit_score;
  if (evaluation.eligibility_pass && score >= 0.7) {
    return {
      label: "Strong pursue",
      detail:
        "This is a high-fit opportunity. Move quickly on requirements and start the proposal plan.",
      tone: "good",
    };
  }
  if (evaluation.eligibility_pass && score >= 0.45) {
    return {
      label: "Selective pursue",
      detail:
        "This may be worth pursuing if the program aligns with a current project or partner need.",
      tone: "warning",
    };
  }
  if (!evaluation.eligibility_pass) {
    return {
      label: "Eligibility risk",
      detail:
        "The fit check found an eligibility concern. Review the rule rationale before spending proposal time.",
      tone: "danger",
    };
  }
  return {
    label: "Low priority",
    detail: "The match score is weak. Keep this as a reference unless strategic context changes.",
    tone: "neutral",
  };
}

function toneClasses(tone: "good" | "warning" | "danger" | "neutral") {
  switch (tone) {
    case "good":
      return "border-success/30 bg-success/5 text-success";
    case "warning":
      return "border-warning/30 bg-warning/5 text-warning";
    case "danger":
      return "border-destructive/30 bg-destructive/5 text-destructive";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
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
  discoveredAt,
  url,
  funderUrl,
  evaluation,
  requirements,
  enrichAttempts,
  enrichLastError,
  busy,
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
  discoveredAt?: string | null;
  url: string;
  funderUrl?: string | null;
  evaluation: Evaluation;
  requirements: Requirement[] | null;
  enrichAttempts?: number | null;
  enrichLastError?: string | null;
  busy: string | null;
  onEvaluate: () => void;
  onDraft: () => void;
  onShowAdvanced: () => void;
}) {
  const dl = deadlineState(deadline);
  const rows = eligibilityRows(eligibility);
  const reqs = requirements ?? [];
  const criticalReqs = reqs.filter((r) => r.isCritical);
  const supportingReqs = reqs.filter((r) => !r.isCritical);
  const fitScore = evaluation ? Math.round(evaluation.fit_score * 100) : null;
  const canDraft = ["scored", "shortlisted", "in_proposal"].includes(status);
  const shouldEvaluate = status === "discovered" || (status === "enriched" && !evaluation);
  const isTracking = ["submitted", "won", "lost"].includes(status);
  const enrichmentFailed = status === "discovered" && (enrichAttempts ?? 0) >= MAX_ENRICH_ATTEMPTS;
  const lowData = !summary && !evaluation?.rationale_en && rows.length === 0 && reqs.length === 0;
  const verdict = strategicVerdict({ evaluation, deadline: dl, status, lowData });
  const amount = amountLabel(amountMin, amountMax);
  const statusLabel = STATUS_LABEL[status] ?? humanize(status);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-5 sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <FunderMark name={funderName} />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses(verdict.tone)}`}
                  >
                    {verdict.label}
                  </span>
                  <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {statusLabel}
                  </span>
                </div>
                <h1 className="font-display text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
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
                    <span className="font-medium text-foreground/80">{funderName}</span>
                  )}
                  {jurisdiction && (
                    <>
                      <span aria-hidden>/</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {jurisdiction}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {verdict.detail}
                </p>
              </div>
            </div>
          </div>

          <aside className="border-t bg-muted/20 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <SignalTile label="Match" icon={Target}>
                {fitScore == null ? (
                  <span className="text-sm text-muted-foreground">Not checked</span>
                ) : (
                  <span
                    className={
                      fitScore >= 70
                        ? "text-success"
                        : fitScore >= 45
                          ? "text-warning"
                          : "text-muted-foreground"
                    }
                  >
                    {fitScore}
                    <span className="text-xs font-normal text-muted-foreground">/100</span>
                  </span>
                )}
              </SignalTile>
              <SignalTile label="Eligibility" icon={ShieldCheck}>
                {evaluation ? (
                  evaluation.eligibility_pass ? (
                    <span className="text-success">Pass</span>
                  ) : (
                    <span className="text-destructive">Risk</span>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">Unknown</span>
                )}
              </SignalTile>
              <SignalTile label="Amount" icon={Landmark}>
                <span className="text-sm">{amount}</span>
              </SignalTile>
              <SignalTile label="Deadline" icon={CalendarDays}>
                <span
                  className={
                    dl.tone === "danger"
                      ? "text-destructive"
                      : dl.tone === "warning"
                        ? "text-warning"
                        : ""
                  }
                >
                  {dl.label}
                </span>
              </SignalTile>
            </div>
          </aside>
        </div>
      </section>

      {enrichmentFailed && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Details could not be loaded automatically</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Automatic enrichment stopped after {MAX_ENRICH_ATTEMPTS} attempts.
              {enrichLastError ? ` Last error: ${enrichLastError}.` : ""} Use the official page or
              open Advanced to inspect and retry the source fetch.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-5">
          <BriefSection title="Executive summary" icon={Sparkles}>
            <p className="text-sm leading-7 text-foreground/90">
              {summary ??
                "No reliable program summary is available in the catalog yet. Treat this as an unvalidated lead until the official page is reviewed or enrichment succeeds."}
            </p>
          </BriefSection>

          {evaluation?.rationale_en && (
            <BriefSection title="Fit rationale" icon={Target}>
              <p className="text-sm leading-7 text-foreground/90">{evaluation.rationale_en}</p>
            </BriefSection>
          )}

          <BriefSection title="Eligibility readout" icon={ShieldCheck}>
            {rows.length > 0 ? (
              <div className="divide-y divide-border/60">
                {rows.slice(0, 8).map(([label, value]) => (
                  <EligibilityLine key={label} label={label} value={value} />
                ))}
              </div>
            ) : (
              <EmptyCopy>
                Eligibility detail is not structured yet. Run a fit check, review the official
                criteria, or open Advanced for raw extracted fields.
              </EmptyCopy>
            )}
          </BriefSection>

          <BriefSection title="Application package" icon={FileCheck2}>
            {reqs.length > 0 ? (
              <div className="space-y-3">
                {criticalReqs.length > 0 && (
                  <RequirementGroup label="Required" requirements={criticalReqs} critical />
                )}
                {supportingReqs.length > 0 && (
                  <RequirementGroup label="Supporting" requirements={supportingReqs} />
                )}
              </div>
            ) : (
              <EmptyCopy>
                No application requirements have been extracted yet. Use the official grant page
                before starting a draft.
              </EmptyCopy>
            )}
          </BriefSection>

          {sectors && sectors.length > 0 && (
            <BriefSection title="Strategic fit tags" icon={Layers3}>
              <div className="flex flex-wrap gap-1.5">
                {sectors.map((sector) => (
                  <Badge key={sector} variant="secondary" className="font-normal">
                    {humanize(sector)}
                  </Badge>
                ))}
              </div>
            </BriefSection>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Next best action
            </h2>
            <div className="mt-4 space-y-2">
              {shouldEvaluate ? (
                <Button className="w-full" disabled={busy === "eval"} onClick={onEvaluate}>
                  {busy === "eval" ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Checking fit
                    </>
                  ) : (
                    "Check my fit"
                  )}
                </Button>
              ) : canDraft ? (
                <Button className="w-full" disabled={busy === "draft"} onClick={onDraft}>
                  {busy === "draft" ? "Starting draft" : "Draft proposal"}
                </Button>
              ) : isTracking ? (
                <Button asChild className="w-full" variant="outline">
                  <Link to="/submissions">
                    <FileText className="mr-1.5 h-4 w-4" />
                    Track outcome
                  </Link>
                </Button>
              ) : (
                <Button className="w-full" variant="outline" onClick={onShowAdvanced}>
                  Review full analysis
                </Button>
              )}
              <Button asChild className="w-full" variant="outline">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Official grant page
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Source and timing
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <MetaLine label="Funder">{funderName}</MetaLine>
              {jurisdiction && <MetaLine label="Jurisdiction">{jurisdiction}</MetaLine>}
              <MetaLine label="Deadline">
                <span
                  className={
                    dl.tone === "danger"
                      ? "text-destructive"
                      : dl.tone === "warning"
                        ? "text-warning"
                        : ""
                  }
                >
                  {dl.label}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">{dl.detail}</span>
              </MetaLine>
              {discoveredAt && (
                <MetaLine label="Discovered">
                  {new Date(discoveredAt).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </MetaLine>
              )}
              <MetaLine label="Source">
                <a
                  href={funderUrl || url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open source <ExternalLink className="h-3 w-3" />
                </a>
              </MetaLine>
            </dl>
            <button
              type="button"
              onClick={onShowAdvanced}
              className="mt-4 inline-flex items-center gap-1 border-t pt-4 text-xs font-semibold text-primary hover:underline"
            >
              Evidence, trace and audit trail <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FunderMark({ name }: { name: string }) {
  return (
    <div
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display text-sm font-semibold text-primary"
    >
      {initialsOf(name)}
    </div>
  );
}

function SignalTile({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 break-words text-lg font-semibold leading-tight tabular-nums">
        {children}
      </div>
    </div>
  );
}

function BriefSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-6 text-muted-foreground">{children}</p>;
}

function EligibilityLine({ label, value }: { label: string; value: unknown }) {
  const yes = value === true || value === "yes" || value === "Yes";
  const no = value === false || value === "no" || value === "No";
  const parsed = parseMaybeJson(value);
  return (
    <div className="flex gap-3 py-2">
      {yes ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : no ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{humanize(label)}</p>
        {!yes && !no && <EligibilityValue value={parsed} />}
      </div>
    </div>
  );
}

function EligibilityValue({ value }: { value: unknown }) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {value.map((item, index) => (
          <Badge key={index} variant="outline" className="text-[11px] font-normal">
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </Badge>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {Object.entries(value as Record<string, unknown>)
          .map(
            ([key, rowValue]) =>
              `${humanize(key)}: ${Array.isArray(rowValue) ? rowValue.join(", ") : String(rowValue)}`,
          )
          .join(" | ")}
      </p>
    );
  }
  return <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(value)}</p>;
}

function RequirementGroup({
  label,
  requirements,
  critical = false,
}: {
  label: string;
  requirements: Requirement[];
  critical?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-2">
        {requirements.map((requirement, index) => (
          <li key={`${requirement.requirement}-${index}`} className="flex gap-2 text-sm leading-6">
            {critical ? (
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-warning" />
            ) : (
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            )}
            <span>{requirement.requirement}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetaLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}
