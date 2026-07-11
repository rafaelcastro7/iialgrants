// EXPRESS view — the strategic overview of the grants workspace. Answers, in
// order: (1) how is my pipeline doing (stats strip), (2) what am I already
// working on (In progress), (3) which new opportunities should I pursue
// (Top matches, score-rail cards), (4) what still needs a fit check (compact
// rows). Plain language, one action per row; the Advanced toggle keeps the
// full Kanban for power users.
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Landmark,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { isActiveGrantStatus } from "@/agents/pipeline-stages.shared";
import type { GrantRowData } from "@/components/grants/GrantRow";
import { StatCard, StatGrid } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;

// Statuses where work has already started — these are commitments, not
// opportunities, so they lead the page.
const IN_PROGRESS = new Set(["shortlisted", "in_proposal", "submitted", "won"]);

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  shortlisted: { label: "Shortlisted", cls: "bg-brand/15 text-brand-foreground" },
  in_proposal: { label: "In proposal", cls: "bg-info/15 text-info" },
  submitted: { label: "Submitted", cls: "bg-info/15 text-info" },
  won: { label: "Won", cls: "bg-success/15 text-success" },
};

function funderName(g: GrantRowData): string {
  const f = Array.isArray(g.funder) ? g.funder[0] : g.funder;
  return f?.name ?? "Unknown funder";
}

function fitOf(g: GrantRowData): number | null {
  return g.evaluation?.fit_score ?? g.fit_score ?? null;
}

function fmtCad(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function amountLabel(g: GrantRowData): string {
  if (g.amount_cad_min != null && g.amount_cad_max != null) {
    return `${fmtCad(g.amount_cad_min)} – ${fmtCad(g.amount_cad_max)}`;
  }
  if (g.amount_cad_max != null) return `Up to ${fmtCad(g.amount_cad_max)}`;
  if (g.amount_cad_min != null) return `From ${fmtCad(g.amount_cad_min)}`;
  return "Amount not published";
}

function daysToDeadline(g: GrantRowData): number | null {
  if (!g.deadline) return null;
  const days = Math.ceil((new Date(g.deadline).getTime() - Date.now()) / DAY_MS);
  return Number.isNaN(days) ? null : days;
}

function deadlineInfo(g: GrantRowData): { label: string; tone: "ok" | "soon" | "urgent" | "none" } {
  const days = daysToDeadline(g);
  if (days == null) return { label: "Rolling / no deadline", tone: "none" };
  if (days < 0) return { label: "Deadline passed", tone: "urgent" };
  if (days === 0) return { label: "Closes today", tone: "urgent" };
  if (days <= 7) return { label: `Closes in ${days} day${days === 1 ? "" : "s"}`, tone: "urgent" };
  if (days <= 30) return { label: `Closes in ${days} days`, tone: "soon" };
  return { label: `Closes ${new Date(g.deadline!).toLocaleDateString("en-CA")}`, tone: "ok" };
}

// Score tier: gives the raw number a word a first-time user can act on.
function tierOf(fit: number): { word: string; text: string; tint: string } {
  if (fit >= 0.7) return { word: "Strong", text: "text-success", tint: "bg-success/5" };
  if (fit >= 0.45) return { word: "Possible", text: "text-warning", tint: "bg-warning/5" };
  return { word: "Weak", text: "text-muted-foreground", tint: "bg-muted/40" };
}

export function GrantExpressView({
  grants,
  evaluatingIds,
  onEvaluate,
}: {
  grants: GrantRowData[];
  evaluatingIds: Set<string>;
  onEvaluate: (id: string) => void;
}) {
  const active = grants.filter((g) => isActiveGrantStatus(g.status));

  const byEligibleThenFit = (a: GrantRowData, b: GrantRowData) => {
    const ae = a.evaluation?.eligibility_pass ? 1 : 0;
    const be = b.evaluation?.eligibility_pass ? 1 : 0;
    if (ae !== be) return be - ae;
    return (fitOf(b) ?? -1) - (fitOf(a) ?? -1);
  };

  const inProgress = active.filter((g) => IN_PROGRESS.has(g.status)).sort(byEligibleThenFit);
  const matches = active
    .filter((g) => !IN_PROGRESS.has(g.status) && g.evaluation)
    .sort(byEligibleThenFit);
  const unchecked = active
    .filter((g) => !IN_PROGRESS.has(g.status) && !g.evaluation)
    .sort((a, b) => a.title.localeCompare(b.title));

  // Strategic stats — same definitions the dashboard uses, so numbers agree.
  const eligible = active.filter((g) => g.evaluation?.eligibility_pass);
  const eligibleValue = eligible.reduce(
    (sum, g) => sum + (g.amount_cad_max ?? g.amount_cad_min ?? 0),
    0,
  );
  const closingSoon = active.filter((g) => {
    const d = daysToDeadline(g);
    return d != null && d >= 0 && d <= 30;
  }).length;

  if (active.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
        No active opportunities yet. Run discovery from the Admin panel, or switch to the Advanced
        view.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pipeline at a glance */}
      <StatGrid columns={4}>
        <StatCard
          label="In progress"
          value={inProgress.length}
          icon={Send}
          sublabel="Shortlisted → submitted"
        />
        <StatCard
          label="Eligible now"
          value={eligible.length}
          icon={CheckCircle2}
          tone={eligible.length > 0 ? "success" : "default"}
          sublabel="Fit check passed"
        />
        <StatCard
          label="Eligible value (CAD)"
          value={eligibleValue > 0 ? fmtCad(eligibleValue) : "—"}
          icon={Landmark}
          sublabel={eligibleValue > 0 ? "Published maximums" : "Amounts not published"}
        />
        <StatCard
          label="Closing in 30 days"
          value={closingSoon}
          icon={CalendarDays}
          tone={closingSoon > 0 ? "warning" : "default"}
          sublabel={closingSoon > 0 ? "Act before the deadline" : "No deadlines this month"}
        />
      </StatGrid>

      {inProgress.length > 0 && (
        <section>
          <GroupHeader
            title="In progress"
            count={inProgress.length}
            hint="Proposals and submissions underway"
          />
          <ul className="space-y-3">
            {inProgress.map((g) => (
              <MatchCard key={g.id} g={g} mode="progress" />
            ))}
          </ul>
        </section>
      )}

      {matches.length > 0 && (
        <section>
          <GroupHeader
            title="Top matches"
            count={matches.length}
            hint="Eligible and best-fit first"
          />
          <ul className="space-y-3">
            {matches.map((g) => (
              <MatchCard key={g.id} g={g} mode="match" />
            ))}
          </ul>
        </section>
      )}

      {unchecked.length > 0 && (
        <section>
          <GroupHeader
            title="Not yet checked"
            count={unchecked.length}
            hint="Run a fit check to score these against your organization"
          />
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {unchecked.map((g) => (
              <UncheckedRow
                key={g.id}
                g={g}
                evaluating={evaluatingIds.has(g.id)}
                onEvaluate={onEvaluate}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function GroupHeader({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      </h2>
      <span className="hidden text-xs text-muted-foreground sm:inline">· {hint}</span>
    </div>
  );
}

/**
 * A match card is a scannable row: score rail (number + tier) | grant facts |
 * one action. The rail keeps every score in the same spot so the eye can run
 * down the list comparing opportunities.
 */
function MatchCard({ g, mode }: { g: GrantRowData; mode: "progress" | "match" }) {
  const fit = fitOf(g);
  const tier = fit != null ? tierOf(fit) : null;
  const dl = deadlineInfo(g);
  const eligible = g.evaluation ? g.evaluation.eligibility_pass : null;
  const chip = STATUS_CHIP[g.status];

  return (
    <li className="overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        {/* Score rail */}
        <div
          className={`flex shrink-0 items-center justify-center gap-3 border-b border-border/60 px-4 py-2.5 sm:w-28 sm:flex-col sm:gap-1 sm:border-b-0 sm:border-r sm:py-4 ${
            tier?.tint ?? "bg-muted/30"
          }`}
        >
          {fit != null && tier ? (
            <>
              <span className={`text-3xl font-bold leading-none tabular-nums ${tier.text}`}>
                {Math.round(fit * 100)}
              </span>
              <span className="sm:text-center">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  match
                </span>
                <span className={`text-[11px] font-semibold ${tier.text}`}>{tier.word}</span>
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Not scored</span>
          )}
        </div>

        {/* Facts */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/grants/$id"
              params={{ id: g.id }}
              className="text-base font-semibold leading-snug text-primary hover:underline"
              title={g.title}
            >
              {g.title}
            </Link>
            {mode === "progress" && chip && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}
              >
                {chip.label}
              </span>
            )}
            {(g.duplicateGroupSize ?? 1) > 1 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning"
                title="Other active records share this funder and a near-identical title — figures may be inconsistent between them."
              >
                <AlertTriangle className="h-3 w-3" /> {g.duplicateGroupSize} similar records
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{funderName(g)}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {eligible != null &&
              (eligible ? (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> You can apply
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> Likely not eligible
                </span>
              ))}
            <span className="font-medium tabular-nums">{amountLabel(g)}</span>
            <span
              className={`inline-flex items-center gap-1 ${
                dl.tone === "urgent"
                  ? "font-medium text-destructive"
                  : dl.tone === "soon"
                    ? "text-warning"
                    : "text-muted-foreground"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> {dl.label}
            </span>
          </div>

          {/* eligibility_pass is a snapshot from the last fit-check; the
              deadline is recomputed live on every render — so "You can apply"
              can keep showing after the deadline has since elapsed, with
              nothing else on the card flagging the contradiction. */}
          {eligible === true && dl.label === "Deadline passed" && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Eligibility was last checked before this deadline passed — re-check before acting.
            </p>
          )}

          {/* tier (fit-score based) and eligible (a separate, independently-
              computed boolean gated on org rules + a configurable pass
              threshold) can legitimately disagree — e.g. a high fit score
              blocked by a hard eligibility rule, or a low fit score that still
              clears a relaxed org threshold. Without this, the card can show
              a bold "Strong"/green rail directly beside "Likely not eligible"
              with nothing explaining why. */}
          {eligible != null && tier && (eligible ? tier.word === "Weak" : tier.word !== "Weak") && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {eligible
                ? "Eligible, but a weak strategic fit for your organization."
                : "Fit score reflects program alignment only — eligibility failed on an organizational rule."}
            </p>
          )}

          {g.evaluation?.rationale_en && (
            <p className="mt-2 line-clamp-2 max-w-3xl text-xs leading-6 text-muted-foreground">
              {g.evaluation.rationale_en}
            </p>
          )}
        </div>

        {/* Action */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:px-5">
          <Button asChild size="sm" className="sm:w-32">
            <Link to="/grants/$id" params={{ id: g.id }}>
              {mode === "progress" ? "Continue" : "See details"}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          <a
            href={g.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:underline"
          >
            Official page
          </a>
        </div>
      </div>
    </li>
  );
}

/** Un-scored grants are leads, not decisions — one compact row each. */
function UncheckedRow({
  g,
  evaluating,
  onEvaluate,
}: {
  g: GrantRowData;
  evaluating: boolean;
  onEvaluate: (id: string) => void;
}) {
  const dl = deadlineInfo(g);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-accent/40 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <Link
          to="/grants/$id"
          params={{ id: g.id }}
          className="text-sm font-medium text-primary hover:underline"
          title={g.title}
        >
          {g.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {funderName(g)} · {amountLabel(g)} · {dl.label}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={evaluating}
        onClick={() => onEvaluate(g.id)}
      >
        {evaluating ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Checking…
          </>
        ) : (
          "Check my fit"
        )}
      </Button>
    </li>
  );
}
