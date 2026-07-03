import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Trophy,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Search,
  Languages,
  Brain,
  Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "discovered" | "enriched" | "evaluated" | "verdict";

interface Props {
  status: string;
  discoveredAt: string | null;
  enrichedAt: string | null;
  scoredAt: string | null;
  evaluation: {
    fit_score: number;
    eligibility_pass: boolean;
    rationale_en: string;
    rationale_fr: string;
    created_at: string;
  } | null;
  isEvaluating?: boolean;
  fr?: boolean;
}

const STAGE_ORDER: Stage[] = ["discovered", "enriched", "evaluated", "verdict"];
const STAGE_ICON: Record<Stage, typeof Search> = {
  discovered: Search,
  enriched: Languages,
  evaluated: Brain,
  verdict: Gavel,
};

function stageReached(stage: Stage, p: Props): "done" | "active" | "pending" {
  const { discoveredAt, enrichedAt, evaluation, isEvaluating } = p;
  if (stage === "discovered") return discoveredAt ? "done" : "pending";
  if (stage === "enriched") {
    if (enrichedAt) return "done";
    return discoveredAt ? "active" : "pending";
  }
  if (stage === "evaluated") {
    if (evaluation) return "done";
    if (isEvaluating) return "active";
    return enrichedAt ? "active" : "pending";
  }
  if (evaluation) return "done";
  return "pending";
}

function tier(score: number) {
  if (score >= 0.7)
    return {
      key: "strong",
      color: "text-emerald-600",
      ring: "stroke-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      icon: Trophy,
    };
  if (score >= 0.4)
    return {
      key: "partial",
      color: "text-amber-600",
      ring: "stroke-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      icon: AlertTriangle,
    };
  return {
    key: "poor",
    color: "text-rose-600",
    ring: "stroke-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    icon: XCircle,
  };
}

function ScoreGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const t = tier(value);
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={r} className="stroke-muted fill-none" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          className={cn("fill-none transition-all duration-700", t.ring)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-xl font-bold tabular-nums", t.color)}>
          {Math.round(pct * 100)}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">fit</span>
      </div>
    </div>
  );
}

const LABELS = {
  stages: {
    discovered: "Discovered",
    enriched: "Enriched",
    evaluated: "Evaluated",
    verdict: "Verdict",
  },
  stageDesc: {
    discovered: "Sourced from funder",
    enriched: "Normalized",
    evaluated: "AI fit analysis",
    verdict: "Recommendation",
  },
  verdict: { strong: "Strong fit", partial: "Partial fit", poor: "Poor fit" },
  eligiblePass: "Eligible",
  eligibleFail: "Not eligible",
  rationale: "Rationale",
  waitingProfile: "Set up your organization profile to enable AI fit evaluation.",
  waitingEnrich: "Waiting for enrichment…",
  evaluating: "AI is evaluating fit…",
  showDetails: "See what happened in each step",
  hideDetails: "Hide step details",
  at: "at",
  detail: {
    discovered: {
      done: "We found this funding opportunity on the funder's website and saved it to your catalog. No AI interpretation yet — just the raw notice.",
      active: "Scanning the funder's website for new programs…",
      pending: "Not started yet.",
    },
    enriched: {
      done: "The AI cleaned up the listing: parsed the deadline into a real date and normalized amounts to Canadian dollars so it's comparable with other grants.",
      active: "The AI is standardizing the grant details right now…",
      pending: "Will run automatically once the grant is discovered.",
    },
    evaluated: {
      done: "The AI compared this grant's eligibility, sectors, jurisdiction and stage against your organization profile, then produced a fit score from 0 to 100 and a written rationale.",
      active: "Comparing the grant requirements with your organization profile…",
      pending: "Will run as soon as enrichment finishes (and you have an organization profile).",
    },
    verdict: {
      done: "Final recommendation based on the fit score and the eligibility check. Read the rationale above to see the reasoning the AI gave.",
      active: "Composing the final verdict…",
      pending: "Waiting for evaluation to finish.",
    },
  },
} as const;

function formatTs(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function FitEvaluation(props: Props) {
  const L = LABELS;
  const e = props.evaluation;
  const t = e ? tier(e.fit_score) : null;
  const VerdictIcon = t?.icon;
  const [open, setOpen] = useState(false);

  const stageTs: Record<Stage, string | null> = {
    discovered: props.discoveredAt,
    enriched: props.enrichedAt,
    evaluated: e?.created_at ?? props.scoredAt,
    verdict: e?.created_at ?? null,
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Stepper */}
      <div className="px-4 pt-4">
        <ol className="grid grid-cols-4 gap-2">
          {STAGE_ORDER.map((s, i) => {
            const state = stageReached(s, props);
            const Icon = state === "done" ? CheckCircle2 : state === "active" ? Loader2 : Circle;
            return (
              <li key={s} className="flex flex-col">
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      state === "done" && "text-emerald-600",
                      state === "active" && "text-primary animate-spin",
                      state === "pending" && "text-muted-foreground/40",
                    )}
                  />
                  {i < STAGE_ORDER.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 flex-1 rounded transition-colors",
                        // Line only goes green if THIS stage is done — prevents
                        // showing a complete pipeline when evaluation ran on raw
                        // (un-enriched) data and the user thinks enrich succeeded.
                        state === "done" ? "bg-emerald-500/60" : "bg-border",
                      )}
                    />
                  )}
                </div>
                <div className="mt-1.5">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      state === "pending" && "text-muted-foreground/60",
                    )}
                  >
                    {L.stages[s]}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {L.stageDesc[s]}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Verdict body */}
      <div className={cn("mt-3 px-4 py-4 border-t", t?.bg ?? "")}>
        {e && t && VerdictIcon ? (
          <div className="flex gap-4 items-start">
            <ScoreGauge value={e.fit_score} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <VerdictIcon className={cn("h-5 w-5", t.color)} />
                <span className={cn("text-sm font-semibold", t.color)}>
                  {L.verdict[t.key as "strong" | "partial" | "poor"]}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border",
                    e.eligibility_pass
                      ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                      : "border-rose-500/30 text-rose-700 dark:text-rose-400 bg-rose-500/10",
                  )}
                >
                  {e.eligibility_pass ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" />
                  )}
                  {e.eligibility_pass ? L.eligiblePass : L.eligibleFail}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {L.rationale}
              </p>
              <p className="text-sm text-foreground/90 leading-relaxed mt-0.5">
                {e.rationale_en || e.rationale_fr || ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {props.isEvaluating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{L.evaluating}</span>
              </>
            ) : props.enrichedAt ? (
              <>
                <Sparkles className="h-4 w-4 text-primary" />
                <span>{L.waitingProfile}</span>
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
                <span>{L.waitingEnrich}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Collapsible "what happened" — plain-language per step */}
      <div className="border-t">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            {open ? L.hideDetails : L.showDetails}
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <ol className="px-4 pb-4 space-y-3">
            {STAGE_ORDER.map((s) => {
              const state = stageReached(s, props);
              const Icon = STAGE_ICON[s];
              const ts = formatTs(stageTs[s]);
              const text = L.detail[s][state];
              return (
                <li key={s} className="flex gap-3">
                  <div
                    className={cn(
                      "mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 border",
                      state === "done" &&
                        "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
                      state === "active" && "bg-primary/10 border-primary/30 text-primary",
                      state === "pending" && "bg-muted border-border text-muted-foreground/60",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", state === "active" && "animate-pulse")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-medium">{L.stages[s]}</p>
                      {ts && state === "done" && (
                        <span className="text-[11px] text-muted-foreground">
                          {L.at} {ts}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
