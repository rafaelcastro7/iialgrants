// The clear, complete grant view. Goal: a grant seeker can decide "should I
// apply, and what do I need" in seconds, with every detail we hold shown in
// plain language. Deep machine internals (agent traces, fetch trail, run ids,
// raw evidence) stay behind the Advanced toggle.
import {
  AlertTriangle,
  Award,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Layers,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MAX_ENRICH_ATTEMPTS } from "@/agents/pipeline-stages.shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  // Join runs of consecutive acronyms with a slash (AI/ML), words with spaces.
  return words
    .map((w, i) => {
      const prevAcronym = i > 0 && /^[A-Z&]+$/.test(words[i - 1]);
      const thisAcronym = /^[A-Z&]+$/.test(w);
      return (i > 0 ? (prevAcronym && thisAcronym ? "/" : " ") : "") + w;
    })
    .join("");
}

// Render one eligibility value in plain language: booleans as Yes/No, arrays as
// chips, scalars as text. Nested objects are flattened one level.
function EligibilityRow({ label, value }: { label: string; value: unknown }) {
  const yes = value === true || value === "Yes" || value === "yes";
  const no = value === false || value === "No" || value === "no";
  return (
    <div className="flex items-start gap-2 py-1.5">
      {yes ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : no ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
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
  // Some grants wrap the real criteria under a single { items: ... } key.
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
      ? "text-slate-400"
      : fitPct >= 70
        ? "text-emerald-600"
        : fitPct >= 45
          ? "text-amber-600"
          : "text-slate-400";
  const elig = eligibilityEntries(eligibility);
  const reqs = requirements ?? [];
  const criticalReqs = reqs.filter((r) => r.isCritical);
  const otherReqs = reqs.filter((r) => !r.isCritical);
  const canDraft = ["scored", "shortlisted", "in_proposal"].includes(status);
  const needsEval = status === "discovered" || (status === "enriched" && !evaluation);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          {funderId ? (
            <Link
              to="/funders/$funderId"
              params={{ funderId }}
              className="text-primary hover:underline"
            >
              {funderName}
            </Link>
          ) : (
            <span>{funderName}</span>
          )}
          {jurisdiction && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>·</span>
              <MapPin className="h-3.5 w-3.5" /> {jurisdiction}
            </span>
          )}
        </p>
      </div>

      {status === "discovered" && (enrichAttempts ?? 0) >= MAX_ENRICH_ATTEMPTS && (
        <Card className="border-rose-400/50 bg-rose-50/60 dark:bg-rose-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium">We could not load this grant's details</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatic retries stopped after {MAX_ENRICH_ATTEMPTS} failed attempts.
                {enrichLastError ? ` Last error: ${enrichLastError}` : ""} Open the official page,
                or switch to Advanced to retry.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision bar — the four facts a seeker decides on, at a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DecisionTile label="Match" icon={Award}>
          {fitPct != null ? (
            <span className={`text-2xl font-bold tabular-nums ${fitTone}`}>{fitPct}</span>
          ) : (
            <span className="text-sm text-muted-foreground">Not checked</span>
          )}
        </DecisionTile>
        <DecisionTile label="Eligibility" icon={CheckCircle2}>
          {evaluation ? (
            evaluation.eligibility_pass ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> You can apply
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600">
                <XCircle className="h-4 w-4" /> Not eligible
              </span>
            )
          ) : (
            <span className="text-sm text-muted-foreground">Run a fit check</span>
          )}
        </DecisionTile>
        <DecisionTile label="Amount (CAD)" icon={Landmark}>
          <span className="text-sm font-semibold tabular-nums">{amountLabel}</span>
        </DecisionTile>
        <DecisionTile label="Deadline" icon={CalendarDays}>
          <span
            className={`text-sm font-semibold ${
              dl.tone === "urgent" ? "text-rose-600" : dl.tone === "soon" ? "text-amber-600" : ""
            }`}
          >
            {dl.short}
          </span>
          {dl.exact && dl.short !== dl.exact && (
            <span className="text-[11px] text-muted-foreground">{dl.exact}</span>
          )}
        </DecisionTile>
      </div>

      {/* Primary action */}
      <div className="flex flex-wrap items-center gap-3">
        {needsEval ? (
          <Button disabled={busy === "eval"} onClick={onEvaluate}>
            {busy === "eval" ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Checking fit…
              </>
            ) : (
              "Check my fit"
            )}
          </Button>
        ) : canDraft ? (
          <Button disabled={busy === "draft"} onClick={onDraft}>
            {busy === "draft" ? "Starting…" : "Draft a proposal"}
          </Button>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Official grant page <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Why it fits */}
      {evaluation?.rationale_en && (
        <Section title="Why this is a match">
          <p className="text-sm leading-relaxed text-foreground/90">{evaluation.rationale_en}</p>
        </Section>
      )}

      {/* Eligibility — readable, not raw JSON */}
      {elig.length > 0 && (
        <Section title="Eligibility">
          <div className="divide-y divide-border/60">
            {elig.map(([k, v]) => (
              <EligibilityRow key={k} label={k} value={v} />
            ))}
          </div>
        </Section>
      )}

      {/* What you'll need */}
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

      {/* About */}
      {summary && (
        <Section title="About this grant">
          <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
        </Section>
      )}

      {/* Key facts */}
      <Section title="Details">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Funder">
            {funderId ? (
              <Link
                to="/funders/$funderId"
                params={{ funderId }}
                className="text-primary hover:underline"
              >
                {funderName}
              </Link>
            ) : (
              funderName
            )}
          </Fact>
          <Fact label="Geography">{jurisdiction || "—"}</Fact>
          <Fact label="Amount (CAD)">{amountLabel}</Fact>
          <Fact label="Deadline">{dl.exact ?? dl.short}</Fact>
          <Fact label="Status">{humanize(status)}</Fact>
          {discoveredAt && (
            <Fact label="Discovered">
              {new Date(discoveredAt).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Fact>
          )}
          {sectors && sectors.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3.5 w-3.5" /> Sectors
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {sectors.map((s) => (
                  <Badge key={s} variant="secondary" className="font-normal">
                    {humanize(s)}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </Section>

      {/* Sources / deeper view */}
      <div className="flex items-center justify-between border-t pt-4">
        <a
          href={funderUrl || url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          Source: {funderName} <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={onShowAdvanced}
          className="text-xs font-medium text-primary hover:underline"
        >
          Full analysis, evidence & audit trail →
        </button>
      </div>
    </div>
  );
}

function DecisionTile({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1.5 flex flex-col leading-tight">{children}</div>
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
