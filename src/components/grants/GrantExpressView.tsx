// EXPRESS view — the simple mode of the grants workspace, born from the UX
// pattern the market leaders converge on (Instrumentl: a prioritized match list
// with a clear fit signal; progressive disclosure for everything else). Plain
// language, best-fit first, ONE primary action per card. Power users switch to
// the Advanced (Kanban) view with the toggle.
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { GrantRowData } from "@/components/grants/GrantRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;

function funderName(g: GrantRowData): string {
  const f = Array.isArray(g.funder) ? g.funder[0] : g.funder;
  return f?.name ?? "Unknown funder";
}

function fitOf(g: GrantRowData): number | null {
  return g.evaluation?.fit_score ?? g.fit_score ?? null;
}

function amountLabel(g: GrantRowData): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(n);
  if (g.amount_cad_min != null && g.amount_cad_max != null)
    return `${fmt(g.amount_cad_min)} – ${fmt(g.amount_cad_max)}`;
  if (g.amount_cad_max != null) return `Up to ${fmt(g.amount_cad_max)}`;
  if (g.amount_cad_min != null) return `From ${fmt(g.amount_cad_min)}`;
  return "Amount not published";
}

function deadlineInfo(g: GrantRowData): { label: string; tone: "ok" | "soon" | "urgent" | "none" } {
  if (!g.deadline) return { label: "Rolling / no deadline", tone: "none" };
  const days = Math.ceil((new Date(g.deadline).getTime() - Date.now()) / DAY_MS);
  if (Number.isNaN(days)) return { label: "Rolling / no deadline", tone: "none" };
  if (days < 0) return { label: "Deadline passed", tone: "urgent" };
  if (days === 0) return { label: "Closes today", tone: "urgent" };
  if (days <= 7) return { label: `Closes in ${days} day${days === 1 ? "" : "s"}`, tone: "urgent" };
  if (days <= 30) return { label: `Closes in ${days} days`, tone: "soon" };
  return { label: `Closes ${new Date(g.deadline).toLocaleDateString("en-CA")}`, tone: "ok" };
}

/** The single next action a basic user should take for this grant. */
function primaryAction(g: GrantRowData): "review" | "evaluate" | "processing" {
  if (g.status === "discovered" || (g.status === "enriched" && !g.evaluation)) return "evaluate";
  if (g.status === "enriched" || g.status === "scored") return "review";
  return "review";
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
  // Express ordering: eligible + best fit first, then closest deadline.
  const ranked = [...grants]
    .filter((g) => !["archived", "expired", "lost"].includes(g.status))
    .sort((a, b) => {
      const ae = a.evaluation?.eligibility_pass ? 1 : 0;
      const be = b.evaluation?.eligibility_pass ? 1 : 0;
      if (ae !== be) return be - ae;
      return (fitOf(b) ?? -1) - (fitOf(a) ?? -1);
    });

  if (ranked.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        No opportunities yet. Run discovery from the Admin panel, or switch to the Advanced view.
      </div>
    );
  }

  return (
    <ul className="space-y-3 max-w-3xl mx-auto">
      {ranked.map((g) => {
        const fit = fitOf(g);
        const dl = deadlineInfo(g);
        const action = primaryAction(g);
        const evaluating = evaluatingIds.has(g.id);
        const eligible = g.evaluation ? g.evaluation.eligibility_pass : null;
        const tierBorder =
          fit == null
            ? "border-l-slate-200"
            : fit >= 0.7
              ? "border-l-emerald-500"
              : fit >= 0.45
                ? "border-l-amber-500"
                : "border-l-slate-300";
        return (
          <li
            key={g.id}
            className={`rounded-lg border border-l-4 ${tierBorder} bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  to="/grants/$id"
                  params={{ id: g.id }}
                  className="font-semibold text-primary hover:underline block truncate text-base"
                  title={g.title}
                >
                  {g.title}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">{funderName(g)}</p>
              </div>
              {fit != null && (
                <div className="text-right shrink-0">
                  <div
                    className={`text-xl font-bold tabular-nums ${
                      fit >= 0.7
                        ? "text-emerald-600"
                        : fit >= 0.45
                          ? "text-amber-600"
                          : "text-slate-400"
                    }`}
                  >
                    {Math.round(fit * 100)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    match
                  </div>
                </div>
              )}
            </div>

            {/* Plain-language facts row */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="font-medium tabular-nums">{amountLabel(g)}</span>
              <span
                className={`inline-flex items-center gap-1 ${
                  dl.tone === "urgent"
                    ? "text-rose-600 font-medium"
                    : dl.tone === "soon"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> {dl.label}
              </span>
              {eligible != null &&
                (eligible ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> You can apply
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600">
                    <XCircle className="h-3.5 w-3.5" /> Likely not eligible
                  </span>
                ))}
              {eligible == null && (
                <Badge variant="secondary" className="text-[10px]">
                  Not checked yet
                </Badge>
              )}
            </div>

            {/* Why, in one sentence (from the real evaluation) */}
            {g.evaluation?.rationale_en && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                {g.evaluation.rationale_en}
              </p>
            )}

            {/* ONE primary action */}
            <div className="mt-3 flex items-center gap-2">
              {action === "evaluate" ? (
                <Button size="sm" disabled={evaluating} onClick={() => onEvaluate(g.id)}>
                  {evaluating ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Checking fit…
                    </>
                  ) : (
                    "Check my fit"
                  )}
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/grants/$id" params={{ id: g.id }}>
                    See details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              <a
                href={g.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:underline"
              >
                Official page
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
