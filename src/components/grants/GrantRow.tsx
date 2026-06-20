// Compact, sortable, expandable grant row. Mirrors the dense "command center"
// lists in Linear / Airtable / Notion: every row fits on one line on desktop,
// with a chevron to expand the heavy fit-analysis inline, and a primary link
// to drill down to the full grant page.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ExternalLink, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FitEvaluation } from "./FitEvaluation";
import { FreshnessBadges } from "./FreshnessBadges";

export type GrantRowData = {
  id: string;
  title: string;
  title_fr: string | null;
  summary: string | null;
  summary_fr: string | null;
  amount_cad_min: number | null;
  amount_cad_max: number | null;
  deadline: string | null;
  status: string;
  url: string;
  discovered_at: string | null;
  enriched_at: string | null;
  scored_at: string | null;
  fit_score: number | null;
  funder: { name: string; name_fr: string | null; jurisdiction: string | null } | { name: string; name_fr: string | null; jurisdiction: string | null }[] | null;
  evaluation: {
    fit_score: number;
    eligibility_pass: boolean;
    rationale_en: string;
    rationale_fr: string;
    created_at: string;
  } | null;
};

function FitChip({ value, eligible }: { value: number | null; eligible: boolean | null }) {
  if (value == null) {
    return <span className="inline-flex items-center justify-center w-11 h-7 rounded-md border border-dashed text-[10px] text-muted-foreground">—</span>;
  }
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.7 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" :
    value >= 0.4 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" :
                   "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return (
    <span
      title={eligible === false ? "Not eligible" : `Fit score ${pct}/100`}
      className={cn(
        "inline-flex items-center justify-center w-11 h-7 rounded-md border text-xs font-semibold tabular-nums",
        tone,
        eligible === false && "opacity-60 line-through decoration-from-font",
      )}
    >
      {pct}
    </span>
  );
}

export function GrantRow({
  g, fr, fmt, isEvaluating, pending,
  onEnrich, onEvaluate, onDraft, isAdmin, t,
}: {
  g: GrantRowData;
  fr: boolean;
  fmt: (n: number | null) => string;
  isEvaluating: boolean;
  pending: string | null;
  onEnrich: (id: string) => void;
  onEvaluate: (id: string) => void;
  onDraft: (id: string) => void;
  isAdmin: boolean;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const funder = Array.isArray(g.funder) ? g.funder[0] : g.funder;
  const title = (fr && g.title_fr) ? g.title_fr : g.title;
  const funderName = funder ? (fr && funder.name_fr ? funder.name_fr : funder.name) : "—";
  const fit = g.evaluation?.fit_score ?? g.fit_score ?? null;
  const eligible = g.evaluation?.eligibility_pass ?? null;
  const summary = (fr && g.summary_fr) ? g.summary_fr : g.summary;

  return (
    <div className={cn(
      "rounded-lg border bg-card transition-colors",
      open ? "shadow-sm" : "hover:bg-muted/30",
    )}>
      {/* Compact row */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 sm:gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="shrink-0 p-1 -m-1 rounded hover:bg-muted/60 text-muted-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <FitChip value={fit} eligible={eligible} />
            <Link
              to="/grants/$id"
              params={{ id: g.id }}
              className="truncate font-medium text-sm hover:underline"
              title={title}
            >
              {title}
            </Link>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
            <span className="truncate">{funderName}{funder?.jurisdiction ? ` · ${funder.jurisdiction}` : ""}</span>
          </div>
        </div>
        <div className="hidden sm:block text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {fmt(g.amount_cad_min)}{g.amount_cad_max != null ? ` – ${fmt(g.amount_cad_max)}` : ""}
        </div>
        <div className="hidden sm:block">
          <FreshnessBadges discoveredAt={g.discovered_at} deadline={g.deadline} fr={fr} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant={g.status === "shortlisted" ? "default" : "outline"} className="text-[10px] font-normal hidden md:inline-flex">
            {t(`grants.status.${g.status}`)}
          </Badge>
          <Button asChild size="sm" variant="ghost" className="h-7 px-2">
            <Link to="/grants/$id" params={{ id: g.id }} aria-label="Open detail">
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Mobile-only badges row (deadline/freshness) */}
      <div className="sm:hidden px-3 pb-2 -mt-1">
        <FreshnessBadges discoveredAt={g.discovered_at} deadline={g.deadline} fr={fr} />
      </div>

      {/* Inline expand: full fit analysis + actions */}
      {open && (
        <div className="border-t bg-muted/10 px-3 py-3 space-y-3">
          {summary && <p className="text-sm text-muted-foreground line-clamp-3">{summary}</p>}
          <FitEvaluation
            status={g.status}
            discoveredAt={g.discovered_at}
            enrichedAt={g.enriched_at}
            scoredAt={g.scored_at}
            evaluation={g.evaluation}
            isEvaluating={isEvaluating}
            fr={fr}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs underline inline-flex items-center gap-1">
              {t("grants.source")} <ExternalLink className="h-3 w-3" />
            </a>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && g.status === "discovered" && (
                <Button size="sm" variant="outline" disabled={pending === g.id + ":enrich"} onClick={() => onEnrich(g.id)}>
                  {pending === g.id + ":enrich" ? t("app.loading") : "Enrich"}
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={pending === g.id} onClick={() => onEvaluate(g.id)}>
                {pending === g.id ? t("app.loading") : (g.evaluation ? (fr ? "Réévaluer" : "Re-evaluate") : t("grants.evaluate"))}
              </Button>
              {(g.status === "scored" || g.status === "shortlisted" || g.status === "in_proposal") && (
                <Button size="sm" disabled={pending === g.id + ":draft"} onClick={() => onDraft(g.id)}>
                  {pending === g.id + ":draft" ? t("app.loading") : t("grants.draftProposal")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sort comparator: eligible first → highest fit_score → soonest deadline → newest.
export function sortByFit(a: GrantRowData, b: GrantRowData): number {
  const aEli = a.evaluation?.eligibility_pass;
  const bEli = b.evaluation?.eligibility_pass;
  if (aEli !== bEli) return (bEli ? 1 : 0) - (aEli ? 1 : 0);
  const aFit = a.evaluation?.fit_score ?? a.fit_score ?? -1;
  const bFit = b.evaluation?.fit_score ?? b.fit_score ?? -1;
  if (aFit !== bFit) return bFit - aFit;
  const aDl = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
  const bDl = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
  if (aDl !== bDl) return aDl - bDl;
  const aDisc = a.discovered_at ? new Date(a.discovered_at).getTime() : 0;
  const bDisc = b.discovered_at ? new Date(b.discovered_at).getTime() : 0;
  return bDisc - aDisc;
}
