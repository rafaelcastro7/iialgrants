// Trust-navy pipeline board for /grants. Six stages, one CTA per card,
// inline filters, KPI strip and workflow ribbon. Mirrors the approved
// "Trust navy pipeline" prototype.
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GrantRowData } from "./GrantRow";

type Stage = {
  key: string;
  label: string;
  statuses: string[];
  dot: string;
  helper: string;
};

const STAGES: Stage[] = [
  { key: "discovered",  label: "Discovered",  statuses: ["discovered"],                  dot: "bg-slate-300",      helper: "Found by the discovery agents. Needs enrichment." },
  { key: "enriched",    label: "Enriched",    statuses: ["enriched"],                    dot: "bg-blue-300",       helper: "Data fully extracted with citations. Ready for fit evaluation." },
  { key: "evaluated",   label: "Evaluated",   statuses: ["scored"],                      dot: "bg-[#3b6fa0]",      helper: "Scored against your screening rules. Review and shortlist." },
  { key: "shortlisted", label: "Shortlisted", statuses: ["shortlisted"],                 dot: "bg-[#1e3a5f]",      helper: "Curated as a real opportunity. Start drafting." },
  { key: "drafting",    label: "Drafting",    statuses: ["in_proposal"],                 dot: "bg-orange-400",     helper: "A proposal exists. Continue writing or send to NotebookLM." },
  { key: "submitted",   label: "Submitted",   statuses: ["submitted","won","lost","expired","archived"], dot: "bg-emerald-500", helper: "Filed with the funder. Outcome tracking only." },
];

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / 86400000);
}

function FitChip({ value, eligible }: { value: number | null; eligible: boolean | null }) {
  if (value == null) {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-dashed border-slate-200 text-slate-400">Not scored</span>;
  }
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.8 ? "bg-emerald-50 text-emerald-700" :
    value >= 0.6 ? "bg-blue-50 text-blue-700" :
    value >= 0.4 ? "bg-amber-50 text-amber-700" :
                   "bg-rose-50 text-rose-700";
  return (
    <span
      className={cn("text-[10px] font-bold px-2 py-0.5 rounded tabular-nums", tone, eligible === false && "line-through opacity-70")}
      title={eligible === false ? "Eligibility failed" : `Fit score ${pct}/100`}
    >
      {pct}% Fit
    </span>
  );
}

function Deadline({ deadline }: { deadline: string | null }) {
  const d = daysLeft(deadline);
  if (d == null) return <span className="text-[10px] text-slate-400 font-medium italic">No deadline</span>;
  if (d < 0) return <span className="text-[10px] font-bold italic text-slate-400">Closed</span>;
  const urgent = d <= 7;
  return (
    <span className={cn("text-[10px] font-medium italic", urgent ? "text-red-500 font-bold" : "text-slate-400")}>
      {d === 0 ? "Due today" : `${d}d left`}
    </span>
  );
}

export type KanbanProps = {
  grants: GrantRowData[];
  isAdmin: boolean;
  pending: string | null;
  evaluatingIds: Set<string>;
  onEnrich: (id: string) => void;
  onEvaluate: (id: string) => void;
  onDraft: (id: string) => void;
  filters: React.ReactNode;
  kpis: { total: number; needsAction: number; avgFit: number | null; pipelineValueCad: number };
  toolbarRight: React.ReactNode;
};

function fmtCad(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function GrantKanban({
  grants, isAdmin, pending, evaluatingIds,
  onEnrich, onEvaluate, onDraft, filters, kpis, toolbarRight,
}: KanbanProps) {
  const buckets = STAGES.map((s) => ({
    ...s,
    items: grants.filter((g) => s.statuses.includes(g.status)),
  }));

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Opportunities" value={String(kpis.total).padStart(2, "0")} />
        <Kpi label="Needs Action" value={String(kpis.needsAction).padStart(2, "0")} accent={kpis.needsAction > 0 ? "danger" : undefined} />
        <Kpi label="Avg Fit" value={kpis.avgFit == null ? "—" : `${Math.round(kpis.avgFit * 100)}%`} />
        <Kpi label="In Pipeline" value={fmtCad(kpis.pipelineValueCad)} dark />
      </div>

      {/* Workflow ribbon */}
      <div className="bg-[hsl(213,30%,93%)] border-l-4 border-[#3b6fa0] px-4 py-3 rounded-r-md flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="bg-[#3b6fa0] text-white text-[10px] font-bold px-2 py-0.5 rounded shrink-0">WORKFLOW</span>
          <p className="text-xs text-[#1e3a5f] font-medium">
            Discover funds → Enrich profile → Evaluate fit → Shortlist → Draft → Submit. Each card shows the next action you should take.
          </p>
        </div>
      </div>

      {/* Filters + toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-card border rounded-lg px-3 py-2 shadow-sm">
        <div className="flex-1 min-w-0">{filters}</div>
        <div className="flex items-center gap-2 shrink-0">{toolbarRight}</div>
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {buckets.map((col) => (
          <div key={col.key} className="flex-shrink-0 w-72">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                {col.label} <span className="ml-1 text-slate-300 tabular-nums">{String(col.items.length).padStart(2, "0")}</span>
              </h3>
              <span className={cn("w-2 h-2 rounded-full", col.dot)} />
            </div>
            <p className="text-[10px] text-slate-400 mb-3 px-1 leading-snug">{col.helper}</p>
            <div className="space-y-3">
              {col.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-400">
                  No grants in this stage
                </div>
              ) : col.items.map((g) => (
                <KanbanCard
                  key={g.id}
                  g={g}
                  stage={col.key}
                  isAdmin={isAdmin}
                  pending={pending}
                  evaluating={evaluatingIds.has(g.id)}
                  onEnrich={onEnrich}
                  onEvaluate={onEvaluate}
                  onDraft={onDraft}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, dark, accent }: { label: string; value: string; dark?: boolean; accent?: "danger" }) {
  return (
    <div className={cn(
      "border rounded-lg p-4 shadow-sm",
      dark ? "bg-[#0f1b3d] border-[#0f1b3d]" : "bg-card",
    )}>
      <p className={cn(
        "text-[10px] uppercase tracking-wider font-semibold mb-1",
        dark ? "text-slate-300" : accent === "danger" ? "text-red-500" : "text-slate-400",
      )}>
        {label}
      </p>
      <p className={cn(
        "text-2xl font-semibold tabular-nums",
        dark ? "text-white" : "text-[#0f1b3d]",
      )}
      style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}

function KanbanCard({
  g, stage, isAdmin, pending, evaluating, onEnrich, onEvaluate, onDraft,
}: {
  g: GrantRowData;
  stage: string;
  isAdmin: boolean;
  pending: string | null;
  evaluating: boolean;
  onEnrich: (id: string) => void;
  onEvaluate: (id: string) => void;
  onDraft: (id: string) => void;
}) {
  const funder = Array.isArray(g.funder) ? g.funder[0] : g.funder;
  const funderName = funder?.name ?? "—";
  const fit = g.evaluation?.fit_score ?? g.fit_score ?? null;
  const eligible = g.evaluation?.eligibility_pass ?? null;
  const hasCitations = Boolean(g.enriched_at);

  const cta = primaryCta({ stage, g, isAdmin, pending, evaluating, onEnrich, onEvaluate, onDraft });

  return (
    <div className={cn(
      "bg-card p-3.5 rounded-xl border shadow-sm hover:shadow-md transition-shadow group",
      stage === "drafting" && "border-2 border-[#1e3a5f]",
      stage === "submitted" && "opacity-75",
    )}>
      <div className="flex justify-between items-start mb-2 gap-2">
        <FitChip value={fit} eligible={eligible} />
        <Deadline deadline={g.deadline} />
      </div>
      <Link
        to="/grants/$id"
        params={{ id: g.id }}
        className="block text-sm font-semibold text-[#0f1b3d] mb-1 leading-snug hover:underline line-clamp-2"
        title={g.title}
      >
        {g.title}
      </Link>
      <p className="text-[11px] text-slate-500 mb-3 truncate">
        {funderName}{funder?.jurisdiction ? ` · ${funder.jurisdiction}` : ""}
      </p>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {hasCitations && (
          <span className="bg-slate-50 text-slate-500 border border-slate-100 text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Evidence cited
          </span>
        )}
        {g.amount_cad_max && (
          <span className="bg-slate-50 text-slate-500 border border-slate-100 text-[9px] px-1.5 py-0.5 rounded tabular-nums">
            up to ${Math.round(g.amount_cad_max / 1000)}K
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {cta}
        <Button asChild size="sm" variant="ghost" className="h-8 px-2 shrink-0" aria-label="Open detail">
          <Link to="/grants/$id" params={{ id: g.id }}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function primaryCta({
  stage, g, isAdmin, pending, evaluating, onEnrich, onEvaluate, onDraft,
}: {
  stage: string; g: GrantRowData; isAdmin: boolean; pending: string | null; evaluating: boolean;
  onEnrich: (id: string) => void; onEvaluate: (id: string) => void; onDraft: (id: string) => void;
}) {
  const baseCls = "flex-1 py-2 text-[11px] font-bold rounded-lg transition-colors h-8";

  if (stage === "discovered") {
    if (!isAdmin) {
      return (
        <Button asChild size="sm" variant="secondary" className={baseCls}>
          <Link to="/grants/$id" params={{ id: g.id }}>Review</Link>
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        disabled={pending === g.id + ":enrich"}
        onClick={() => onEnrich(g.id)}
        className={cn(baseCls, "bg-[hsl(213,30%,93%)] text-[#0f1b3d] hover:bg-[#3b6fa0] hover:text-white")}
      >
        {pending === g.id + ":enrich" ? "Enriching…" : "Enrich profile"}
      </Button>
    );
  }
  if (stage === "enriched") {
    return (
      <Button
        size="sm"
        disabled={pending === g.id || evaluating}
        onClick={() => onEvaluate(g.id)}
        className={cn(baseCls, "bg-[hsl(213,30%,93%)] text-[#0f1b3d] hover:bg-[#3b6fa0] hover:text-white")}
      >
        {evaluating || pending === g.id ? "Evaluating…" : "Evaluate fit"}
      </Button>
    );
  }
  if (stage === "evaluated") {
    return (
      <Button asChild size="sm" variant="secondary" className={baseCls}>
        <Link to="/grants/$id" params={{ id: g.id }}>Review &amp; shortlist</Link>
      </Button>
    );
  }
  if (stage === "shortlisted") {
    return (
      <Button
        size="sm"
        disabled={pending === g.id + ":draft"}
        onClick={() => onDraft(g.id)}
        className={cn(baseCls, "bg-[#0f1b3d] text-white hover:bg-[#1e3a5f]")}
      >
        {pending === g.id + ":draft" ? "Drafting…" : "Start draft"}
      </Button>
    );
  }
  if (stage === "drafting") {
    return (
      <Button asChild size="sm" className={cn(baseCls, "bg-gradient-to-r from-[#1e3a5f] to-[#3b6fa0] text-white hover:brightness-110")}>
        <Link to="/grants/$id" params={{ id: g.id }}>Continue draft</Link>
      </Button>
    );
  }
  // submitted
  return (
    <Button asChild size="sm" variant="outline" className={baseCls}>
      <a href={g.url} target="_blank" rel="noopener noreferrer">
        View source <ExternalLink className="h-3 w-3 ml-1 inline" />
      </a>
    </Button>
  );
}
