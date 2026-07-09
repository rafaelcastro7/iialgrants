// The clear, complete grant view. A grant seeker should decide "should I apply,
// and what do I need" at a glance: a sticky decision sidebar (match, eligibility,
// amount, deadline + the one next action) beside a readable main column (why it
// matches, eligibility, requirements, overview). Deep machine internals (agent
// traces, fetch trail, run ids) stay behind the Advanced toggle.
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MAX_ENRICH_ATTEMPTS } from "@/agents/pipeline-stages.shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;

type Requirement = { category: string; requirement: string; isCritical: boolean };

function fmtCad(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function amountLabelOf(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${fmtCad(min)} – ${fmtCad(max)}`;
  if (max != null) return `Up to ${fmtCad(max)}`;
  if (min != null) return `From ${fmtCad(min)}`;
  return "Not published";
}

function deadlineInfo(deadline: string | null): {
  short: string;
  exact: string | null;
  tone: "ok" | "soon" | "urgent" | "none";
} {
  if (!deadline) return { short: "Rolling", exact: "No fixed deadline", tone: "none" };
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return { short: "Rolling", exact: null, tone: "none" };
  const exact = d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  const days = Math.ceil((d.getTime() - Date.now()) / DAY_MS);
  if (days < 0) return { short: "Closed", exact, tone: "urgent" };
  if (days === 0) return { short: "Closes today", exact, tone: "urgent" };
  if (days <= 7)
    return { short: `${days} day${days === 1 ? "" : "s"} left`, exact, tone: "urgent" };
  if (days <= 30) return { short: `${days} days left`, exact, tone: "soon" };
  return { short: exact, exact: `${days} days away`, tone: "ok" };
}

// Domain acronyms that should stay upper-cased instead of Title-cased, so an
// eligibility key like "ai_ml" reads "AI/ML" rather than "Ai Ml".
const ACRONYMS: Record<string, string> = {
  ai: "AI",
  ml: "ML",
  ip: "IP",
  sme: "SME",
  ngo: "NGO",
  api: "API",
  id: "ID",
  url: "URL",
  gst: "GST",
  hst: "HST",
  pst: "PST",
  rd: "R&D",
};

function humanize(k: string): string {
  const words = k
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.replace(/\b\w/g, (c) => c.toUpperCase()));
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
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

// Render one eligibility value in plain language: booleans as Yes/No, arrays as
// chips, scalars as text. Nested objects are flattened one level.
function EligibilityRow({ label, value }: { label: string; value: unknown }) {
  const yes = value === true || value === "Yes" || value === "yes";
  const no = value === false || value === "No" || value === "no";
  return (
    <div className="flex items-start gap-2 py-1.5">
      {yes ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : no ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
      ) : (
        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      )}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{humanize(label)}</span>{" "}
        {yes || no ? null : Array.isArray(value) ? (
          <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
            {value.map((v, i) => (
              <Badge key={i} variant="outline" className="text-[11px] font-normal">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </Badge>
            ))}
          </span>
        ) : typeof value === "object" && value ? (
          <span className="text-sm text-muted-foreground">
            {Object.entries(value as Record<string, unknown>)
              .map(([k, v]) => `${humanize(k)}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
              .join(" · ")}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{String(value)}</span>
        )}
      </div>
    </div>
  );
}

// A string that is actually JSON (from loosely-typed enrichment) becomes the
// parsed value so we render chips/rows instead of a raw "{...}" blob.
function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return JSON.parse(t);
    } catch {
      return v;
    }
  }
  return v;
}

function eligibilityEntries(eligibility: unknown): Array<[string, unknown]> {
  let e = parseMaybeJson(eligibility);
  if (!e || typeof e !== "object") return [];
  if (!Array.isArray(e)) {
    const rec = e as Record<string, unknown>;
    if (Object.keys(rec).length === 1 && "items" in rec) e = parseMaybeJson(rec.items);
  }
  if (!e || typeof e !== "object") return [];
  const entries = Array.isArray(e)
    ? e.map((v, i) => [`Criterion ${i + 1}`, parseMaybeJson(v)] as [string, unknown])
    : Object.entries(e as Record<string, unknown>).map(
        ([k, v]) => [k, parseMaybeJson(v)] as [string, unknown],
      );
  return entries.filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));
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
  evaluation: { fit_score: number; eligibility_pass: boolean; rationale_en: string } | null;
  requirements: Requirement[] | null;
  enrichAttempts?: number | null;
  enrichLastError?: string | null;
  busy: string | null;
  onEvaluate: () => void;
  onDraft: () => void;
  onShowAdvanced: () => void;
}) {
  const amountLabel = amountLabelOf(amountMin, amountMax);
  const dl = deadlineInfo(deadline);
  const fitPct = evaluation ? Math.round(evaluation.fit_score * 100) : null;
  const fitTone =
    fitPct == null
      ? "text-muted-foreground"
      : fitPct >= 70
        ? "text-success"
        : fitPct >= 45
          ? "text-warning"
          : "text-muted-foreground";
  const elig = eligibilityEntries(eligibility);
  const reqs = requirements ?? [];
  const criticalReqs = reqs.filter((r) => r.isCritical);
  const otherReqs = reqs.filter((r) => !r.isCritical);
  const canDraft = ["scored", "shortlisted", "in_proposal"].includes(status);
  const needsEval = status === "discovered" || (status === "enriched" && !evaluation);
  const inFlight = ["submitted", "won", "lost"].includes(status);
  const enrichFailed = status === "discovered" && (enrichAttempts ?? 0) >= MAX_ENRICH_ATTEMPTS;
  // Low signal = nothing substantive to read in the main column yet.
  const lowData = !evaluation?.rationale_en && elig.length === 0 && reqs.length === 0 && !summary;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="space-y-5 lg:col-span-2">
        {/* Header */}
        <div className="flex items-start gap-3">
          <FunderAvatar name={funderName} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
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
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden>·</span>
                  <MapPin className="h-3.5 w-3.5" /> {jurisdiction}
                </span>
              )}
              <span aria-hidden>·</span>
              <StatusBadge status={status} />
            </p>
          </div>
        </div>

        {enrichFailed && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium">We couldn't load this grant's full details</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatic retries stopped after {MAX_ENRICH_ATTEMPTS} attempts.
                {enrichLastError ? ` Last error: ${enrichLastError}.` : ""} Open the official page
                for the source of truth, or switch to Advanced to retry enrichment.
              </p>
            </div>
          </div>
        )}

        {evaluation?.rationale_en && (
          <Section title="Why this is a match">
            <p className="text-sm leading-relaxed text-foreground/90">{evaluation.rationale_en}</p>
          </Section>
        )}

        <Section title="About this grant">
          {summary ? (
            <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              A detailed program description hasn't been published to our catalog yet. Use the
              official grant page for the authoritative overview, funding terms, and how to apply.
            </p>
          )}
        </Section>

        {elig.length > 0 && (
          <Section title="Eligibility">
            <div className="divide-y divide-border/60">
              {elig.map(([k, v]) => (
                <EligibilityRow key={k} label={k} value={v} />
              ))}
            </div>
          </Section>
        )}

        {reqs.length > 0 && (
          <Section title="What you'll need to apply">
            <ul className="space-y-2 text-sm">
              {[...criticalReqs, ...otherReqs].map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  {r.isCritical ? (
                    <Badge variant="destructive" className="mt-0.5 shrink-0 text-[9px]">
                      required
                    </Badge>
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  )}
                  <span className="leading-relaxed">{r.requirement}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {sectors && sectors.length > 0 && (
          <Section title="Sectors">
            <div className="flex flex-wrap gap-1.5">
              {sectors.map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {humanize(s)}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {/* When we have neither eligibility nor requirements, guide the next step
            instead of leaving a barren page. */}
        {lowData && !enrichFailed && (
          <Section title="Next step">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {needsEval
                ? "Run a fit check to score this grant against your organization and surface eligibility, then we'll guide the proposal."
                : "Open the official grant page for the full eligibility criteria and application details."}
            </p>
          </Section>
        )}
      </div>

      {/* ── Sticky decision sidebar ─────────────────────────────── */}
      <aside className="lg:col-span-1">
        <div className="space-y-4 lg:sticky lg:top-20">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="space-y-3">
              <SnapshotRow label="Match" icon={CheckCircle2}>
                {fitPct != null ? (
                  <span className={`text-2xl font-bold tabular-nums ${fitTone}`}>
                    {fitPct}
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">/100</span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Not checked yet</span>
                )}
              </SnapshotRow>
              <SnapshotRow label="Eligibility" icon={CheckCircle2}>
                {evaluation ? (
                  evaluation.eligibility_pass ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                      <CheckCircle2 className="h-4 w-4" /> You can apply
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
                      <XCircle className="h-4 w-4" /> Not eligible
                    </span>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">Run a fit check</span>
                )}
              </SnapshotRow>
              <SnapshotRow label="Amount (CAD)" icon={Landmark}>
                <span className="text-sm font-semibold tabular-nums">{amountLabel}</span>
              </SnapshotRow>
              <SnapshotRow label="Deadline" icon={CalendarDays}>
                <span
                  className={`text-sm font-semibold ${
                    dl.tone === "urgent"
                      ? "text-destructive"
                      : dl.tone === "soon"
                        ? "text-warning"
                        : ""
                  }`}
                >
                  {dl.short}
                </span>
                {dl.exact && dl.short !== dl.exact && (
                  <span className="block text-[11px] text-muted-foreground">{dl.exact}</span>
                )}
              </SnapshotRow>
            </div>

            {/* The one next action — always resolves to something, never a dead end. */}
            <div className="mt-4 space-y-2">
              {needsEval ? (
                <Button className="w-full" disabled={busy === "eval"} onClick={onEvaluate}>
                  {busy === "eval" ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Checking fit…
                    </>
                  ) : (
                    "Check my fit"
                  )}
                </Button>
              ) : canDraft ? (
                <Button className="w-full" disabled={busy === "draft"} onClick={onDraft}>
                  {busy === "draft" ? "Starting…" : "Draft a proposal"}
                </Button>
              ) : inFlight ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to="/submissions">
                    <FileText className="mr-1.5 h-4 w-4" /> Track submission
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="w-full">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Official grant page <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>

          {/* Funder identity */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Funder
            </h2>
            <div className="flex items-center gap-3">
              <FunderAvatar name={funderName} size="sm" />
              <div className="min-w-0">
                {funderId ? (
                  <Link
                    to="/funders/$funderId"
                    params={{ funderId }}
                    className="block truncate text-sm font-medium text-primary hover:underline"
                  >
                    {funderName}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-medium">{funderName}</span>
                )}
                {jurisdiction && (
                  <span className="text-xs text-muted-foreground">{jurisdiction}</span>
                )}
              </div>
            </div>
            {funderId && (
              <Link
                to="/funders/$funderId"
                params={{ funderId }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View funder profile <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {/* Meta / provenance */}
          <div className="rounded-2xl border bg-card p-5 text-xs shadow-sm">
            <dl className="space-y-2">
              <MetaRow label="Status">{STATUS_LABEL[status] ?? humanize(status)}</MetaRow>
              {discoveredAt && (
                <MetaRow label="Discovered">
                  {new Date(discoveredAt).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </MetaRow>
              )}
              <MetaRow label="Source">
                <a
                  href={funderUrl || url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {funderName} <ExternalLink className="h-3 w-3" />
                </a>
              </MetaRow>
            </dl>
            <button
              type="button"
              onClick={onShowAdvanced}
              className="mt-3 w-full border-t pt-3 text-left text-xs font-medium text-primary hover:underline"
            >
              Full analysis, evidence &amp; audit trail →
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function FunderAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  return (
    <div
      aria-hidden
      className={`flex ${cls} shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display font-semibold text-primary`}
    >
      {initialsOf(name)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "won"
      ? "bg-success/15 text-success"
      : status === "submitted" || status === "in_proposal"
        ? "bg-info/15 text-info"
        : status === "archived" || status === "expired" || status === "lost"
          ? "bg-muted text-muted-foreground"
          : "bg-brand/15 text-brand-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {STATUS_LABEL[status] ?? humanize(status)}
    </span>
  );
}

function SnapshotRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="text-right leading-tight">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
