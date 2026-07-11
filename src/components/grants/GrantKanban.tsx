// Trust-navy pipeline board for /grants. Six stages, one CTA per card,
// inline filters, KPI strip and workflow ribbon. Mirrors the approved
// "Trust navy pipeline" prototype. Admins can drag cards between columns and
// bulk-move a selection; transitions are pre-checked against the shared state
// machine (pipeline-stages.shared.ts) and re-validated server-side + by the
// DB trigger.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canTransition, isGrantStatus, type GrantStatus } from "@/agents/pipeline-stages.shared";
import type { GrantRowData } from "./GrantRow";

type Stage = {
  key: string;
  label: string;
  statuses: string[];
  /** Status a card acquires when dropped on this column (undefined = not a drop target). */
  dropStatus?: GrantStatus;
  dot: string;
  helper: string;
};

const STAGES: Stage[] = [
  {
    key: "discovered",
    label: "Discovered",
    statuses: ["discovered"],
    dot: "bg-slate-300",
    helper: "Found by the discovery agents. Needs enrichment.",
  },
  {
    key: "enriched",
    label: "Enriched",
    statuses: ["enriched"],
    dropStatus: "enriched",
    dot: "bg-blue-300",
    helper: "Data fully extracted with citations. Ready for fit evaluation.",
  },
  {
    key: "evaluated",
    label: "Evaluated",
    statuses: ["scored"],
    dropStatus: "scored",
    dot: "bg-[#3b6fa0]",
    helper: "Scored against your screening rules. Review and shortlist.",
  },
  {
    key: "shortlisted",
    label: "Shortlisted",
    statuses: ["shortlisted"],
    dropStatus: "shortlisted",
    dot: "bg-[#1e3a5f]",
    helper: "Curated as a real opportunity. Start drafting.",
  },
  {
    key: "drafting",
    label: "Drafting",
    statuses: ["in_proposal"],
    dropStatus: "in_proposal",
    dot: "bg-orange-400",
    helper: "A proposal exists. Continue writing or send to NotebookLM.",
  },
  {
    key: "submitted",
    label: "Submitted",
    statuses: ["submitted", "won", "lost", "expired"],
    dropStatus: "submitted",
    dot: "bg-emerald-500",
    helper: "Filed with the funder. Outcome tracking only.",
  },
  {
    key: "archived",
    label: "Archived",
    statuses: ["archived"],
    dropStatus: "archived",
    dot: "bg-slate-400",
    helper: "Filtered out by screening rules or manually archived.",
  },
];

/** Bulk-move targets offered in the selection bar. */
const BULK_TARGETS: Array<{ status: GrantStatus; label: string }> = [
  { status: "shortlisted", label: "Shortlist" },
  { status: "archived", label: "Archive" },
  { status: "expired", label: "Mark expired" },
];

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / 86400000);
}

function FitChip({ value, eligible }: { value: number | null; eligible: boolean | null }) {
  if (value == null) {
    return (
      <span className="rounded border border-dashed border-border/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
        Not scored
      </span>
    );
  }
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.8
      ? "bg-emerald-50 text-emerald-700"
      : value >= 0.6
        ? "bg-blue-50 text-blue-700"
        : value >= 0.4
          ? "bg-amber-50 text-amber-700"
          : "bg-rose-50 text-rose-700";
  return (
    <span
      className={cn(
        "text-[10px] font-bold px-2 py-0.5 rounded tabular-nums",
        tone,
        eligible === false && "line-through opacity-70",
      )}
      title={eligible === false ? "Eligibility failed" : `Fit score ${pct}/100`}
    >
      {pct}% Fit
    </span>
  );
}

function Deadline({ deadline }: { deadline: string | null }) {
  const d = daysLeft(deadline);
  if (d == null)
    return (
      <span className="text-[10px] font-medium italic text-muted-foreground">No deadline</span>
    );
  if (d < 0)
    return <span className="text-[10px] font-bold italic text-muted-foreground">Closed</span>;
  const urgent = d <= 7;
  return (
    <span
      className={cn(
        "text-[10px] font-medium italic",
        urgent ? "text-destructive font-bold" : "text-muted-foreground",
      )}
    >
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
  /** Present for admins only. Enables drag-to-move and bulk actions. */
  onMove?: (grantIds: string[], toStatus: GrantStatus) => void;
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
  grants,
  isAdmin,
  pending,
  evaluatingIds,
  onEnrich,
  onEvaluate,
  onDraft,
  onMove,
  filters,
  kpis,
  toolbarRight,
}: KanbanProps) {
  const buckets = STAGES.map((s) => ({
    ...s,
    items: grants.filter((g) => s.statuses.includes(g.status)),
  }));

  // Drag + selection state (admin-only interactions, gated by onMove).
  const [dragStatus, setDragStatus] = useState<GrantStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSelection = () => setSelected(new Set());

  const handleDrop = (e: React.DragEvent, target: GrantStatus | undefined) => {
    if (!onMove || !target) return;
    e.preventDefault();
    setDragStatus(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData("text/plain")) as {
        id?: string;
        status?: string;
      };
      if (!payload.id || !isGrantStatus(payload.status ?? "")) return;
      if (!canTransition(payload.status as GrantStatus, target) || payload.status === target)
        return;
      onMove([payload.id], target);
    } catch {
      /* foreign drag payload — ignore */
    }
  };

  const bulkMove = (target: GrantStatus) => {
    if (!onMove || selected.size === 0) return;
    onMove([...selected], target);
    clearSelection();
  };

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active Opportunities" value={String(kpis.total).padStart(2, "0")} />
        <Kpi
          label="Needs Action"
          value={String(kpis.needsAction).padStart(2, "0")}
          accent={kpis.needsAction > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Avg Fit"
          value={kpis.avgFit == null ? "-" : `${Math.round(kpis.avgFit * 100)}%`}
        />
        <Kpi label="Pipeline value (CAD)" value={fmtCad(kpis.pipelineValueCad)} dark />
      </div>

      {/* Workflow ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
            WORKFLOW
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            Discover funds - Enrich profile - Evaluate fit - Shortlist - Draft - Submit. Each card
            shows the next action you should take.
          </p>
        </div>
      </div>

      {/* Filters + toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-3 py-2.5 shadow-sm">
        <div className="flex-1 min-w-0">{filters}</div>
        <div className="flex items-center gap-2 shrink-0">{toolbarRight}</div>
      </div>

      {/* Kanban */}
      {grants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/90 p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No grants match your filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try clearing the search or filters above.
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
          {buckets.map((col) => {
            const droppable =
              !!onMove &&
              !!col.dropStatus &&
              !!dragStatus &&
              dragStatus !== col.dropStatus &&
              canTransition(dragStatus, col.dropStatus);
            return (
              <div
                key={col.key}
                className={cn(
                  "w-72 flex-shrink-0 rounded-2xl border border-border/70 bg-card/90 p-3 transition-colors shadow-sm",
                  droppable && "bg-primary/5 outline-dashed outline-2 outline-primary/30",
                )}
                onDragOver={(e) => {
                  if (droppable) e.preventDefault();
                }}
                onDrop={(e) => handleDrop(e, col.dropStatus)}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                    {col.label}{" "}
                    <span className="ml-1 tabular-nums text-muted-foreground/50">
                      {String(col.items.length).padStart(2, "0")}
                    </span>
                  </h3>
                  <span className={cn("w-2 h-2 rounded-full", col.dot)} />
                </div>
                <p className="mb-3 px-1 text-[10px] leading-snug text-muted-foreground">
                  {col.helper}
                </p>
                <div className="space-y-3">
                  {col.items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-[11px] text-muted-foreground">
                      No grants in this stage
                    </div>
                  ) : (
                    col.items.map((g) => (
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
                        draggable={!!onMove}
                        selected={selected.has(g.id)}
                        onToggleSelect={onMove ? toggleSelected : undefined}
                        onDragStatus={setDragStatus}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk action bar */}
      {onMove && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/70 bg-background/90 px-4 py-2.5 text-foreground shadow-xl backdrop-blur">
          <span className="text-xs font-semibold tabular-nums">{selected.size} selected</span>
          <span className="w-px h-4 bg-white/20" />
          {BULK_TARGETS.map((t) => (
            <Button
              key={t.status}
              size="sm"
              variant="secondary"
              className="h-7 text-[11px] font-bold"
              onClick={() => bulkMove(t.status)}
            >
              {t.label}
            </Button>
          ))}
          <button
            type="button"
            onClick={clearSelection}
            className="ml-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  dark,
  accent,
}: {
  label: string;
  value: string;
  dark?: boolean;
  accent?: "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        dark
          ? "border-primary/20 bg-primary text-primary-foreground"
          : "border-border/70 bg-card/90",
      )}
    >
      <p
        className={cn(
          "mb-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
          dark
            ? "text-primary-foreground/70"
            : accent === "danger"
              ? "text-red-500"
              : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          dark ? "text-primary-foreground" : "text-foreground",
        )}
        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}

function KanbanCard({
  g,
  stage,
  isAdmin,
  pending,
  evaluating,
  onEnrich,
  onEvaluate,
  onDraft,
  draggable,
  selected,
  onToggleSelect,
  onDragStatus,
}: {
  g: GrantRowData;
  stage: string;
  isAdmin: boolean;
  pending: string | null;
  evaluating: boolean;
  onEnrich: (id: string) => void;
  onEvaluate: (id: string) => void;
  onDraft: (id: string) => void;
  draggable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDragStatus?: (s: GrantStatus | null) => void;
}) {
  const funder = Array.isArray(g.funder) ? g.funder[0] : g.funder;
  const funderName = funder?.name ?? "-";
  const fit = g.evaluation?.fit_score ?? g.fit_score ?? null;
  const eligible = g.evaluation?.eligibility_pass ?? null;
  const hasCitations = Boolean(g.enriched_at);

  const cta = primaryCta({ stage, g, isAdmin, pending, evaluating, onEnrich, onEvaluate, onDraft });

  return (
    <div
      className={cn(
        "group rounded-2xl border border-border/70 bg-card/90 p-3.5 shadow-sm transition-shadow hover:shadow-md",
        stage === "drafting" && "border-2 border-primary/40",
        stage === "submitted" && "opacity-75",
        draggable && "cursor-grab active:cursor-grabbing",
        selected && "ring-2 ring-primary",
      )}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ id: g.id, status: g.status }));
        e.dataTransfer.effectAllowed = "move";
        onDragStatus?.(isGrantStatus(g.status) ? g.status : null);
      }}
      onDragEnd={() => onDragStatus?.(null)}
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect(g.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-primary"
              aria-label={`Select ${g.title}`}
            />
          )}
          <FitChip value={fit} eligible={eligible} />
        </div>
        <Deadline deadline={g.deadline} />
      </div>
      <Link
        to="/grants/$id"
        params={{ id: g.id }}
        className="mb-1 block text-sm font-semibold leading-snug text-foreground line-clamp-2 hover:underline"
        title={g.title}
      >
        {g.title}
      </Link>
      <p className="mb-3 truncate text-[11px] text-muted-foreground">
        {funderName}
        {funder?.jurisdiction ? ` - ${funder.jurisdiction}` : ""}
      </p>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {hasCitations && (
          <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Evidence cited
          </span>
        )}
        {/* Was inline Math.round(.../1000)+"K" with no scale switch or sanity
            bound: $10 rendered as "up to $0K" and $336,000,000 as an unscaled
            six-digit "up to $336000K" — both observed on real duplicate-grant
            data. Reuse fmtCad for correct K/M scaling and flag implausible
            values (a program of this type is never genuinely <$1K or >$50M)
            as unverified instead of printing them as fact. */}
        {g.amount_cad_max != null &&
          (g.amount_cad_max < 1_000 || g.amount_cad_max > 50_000_000 ? (
            <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] tabular-nums text-warning">
              Unverified amount
            </span>
          ) : (
            <span className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
              up to {fmtCad(g.amount_cad_max)}
            </span>
          ))}
      </div>
      <div className="flex items-center gap-1.5">
        {cta}
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-8 px-2 shrink-0"
          aria-label="Open detail"
        >
          <Link to="/grants/$id" params={{ id: g.id }}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function primaryCta({
  stage,
  g,
  isAdmin,
  pending,
  evaluating,
  onEnrich,
  onEvaluate,
  onDraft,
}: {
  stage: string;
  g: GrantRowData;
  isAdmin: boolean;
  pending: string | null;
  evaluating: boolean;
  onEnrich: (id: string) => void;
  onEvaluate: (id: string) => void;
  onDraft: (id: string) => void;
}) {
  const baseCls = "flex-1 py-2 text-[11px] font-bold rounded-lg transition-colors h-8";

  if (stage === "discovered") {
    if (!isAdmin) {
      return (
        <Button asChild size="sm" variant="secondary" className={baseCls}>
          <Link to="/grants/$id" params={{ id: g.id }}>
            Review
          </Link>
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        disabled={pending === g.id + ":enrich"}
        onClick={() => onEnrich(g.id)}
        className={cn(
          baseCls,
          "bg-muted text-foreground hover:bg-primary hover:text-primary-foreground",
        )}
      >
        {pending === g.id + ":enrich" ? "Enriching..." : "Enrich profile"}
      </Button>
    );
  }
  if (stage === "enriched") {
    return (
      <Button
        size="sm"
        disabled={pending === g.id || evaluating}
        onClick={() => onEvaluate(g.id)}
        className={cn(
          baseCls,
          "bg-muted text-foreground hover:bg-primary hover:text-primary-foreground",
        )}
      >
        {evaluating || pending === g.id ? "Evaluating..." : "Evaluate fit"}
      </Button>
    );
  }
  if (stage === "evaluated") {
    return (
      <Button asChild size="sm" variant="secondary" className={baseCls}>
        <Link to="/grants/$id" params={{ id: g.id }}>
          Review &amp; shortlist
        </Link>
      </Button>
    );
  }
  if (stage === "shortlisted") {
    return (
      <Button
        size="sm"
        disabled={pending === g.id + ":draft"}
        onClick={() => onDraft(g.id)}
        className={cn(baseCls, "bg-primary text-primary-foreground hover:bg-primary/90")}
      >
        {pending === g.id + ":draft" ? "Drafting..." : "Start draft"}
      </Button>
    );
  }
  if (stage === "drafting") {
    return (
      <Button
        asChild
        size="sm"
        className={cn(
          baseCls,
          "bg-gradient-to-r from-primary to-brand text-primary-foreground hover:brightness-110",
        )}
      >
        <Link to="/grants/$id" params={{ id: g.id }}>
          Continue draft
        </Link>
      </Button>
    );
  }
  // submitted
  return (
    <Button asChild size="sm" variant="outline" className={baseCls}>
      <a href={g.url} target="_blank" rel="noopener noreferrer">
        Open funder page <ExternalLink className="h-3 w-3 ml-1 inline" />
      </a>
    </Button>
  );
}
