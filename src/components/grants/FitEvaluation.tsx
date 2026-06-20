import { CheckCircle2, Circle, Loader2, Sparkles, ShieldCheck, ShieldAlert, Trophy, AlertTriangle, XCircle } from "lucide-react";
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
  // verdict
  if (evaluation) return "done";
  return "pending";
}

function tier(score: number) {
  if (score >= 0.7) return { key: "strong", color: "text-emerald-600", ring: "stroke-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", icon: Trophy };
  if (score >= 0.4) return { key: "partial", color: "text-amber-600", ring: "stroke-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", icon: AlertTriangle };
  return { key: "poor", color: "text-rose-600", ring: "stroke-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40", icon: XCircle };
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
          cx="44" cy="44" r={r}
          className={cn("fill-none transition-all duration-700", t.ring)}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-xl font-bold tabular-nums", t.color)}>{Math.round(pct * 100)}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">fit</span>
      </div>
    </div>
  );
}

const LABELS = {
  en: {
    stages: { discovered: "Discovered", enriched: "Enriched", evaluated: "Evaluated", verdict: "Verdict" },
    stageDesc: {
      discovered: "Sourced from funder",
      enriched: "Bilingual + normalized",
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
  },
  fr: {
    stages: { discovered: "Découvert", enriched: "Enrichi", evaluated: "Évalué", verdict: "Verdict" },
    stageDesc: {
      discovered: "Source du bailleur",
      enriched: "Bilingue + normalisé",
      evaluated: "Analyse IA",
      verdict: "Recommandation",
    },
    verdict: { strong: "Excellente adéquation", partial: "Adéquation partielle", poor: "Faible adéquation" },
    eligiblePass: "Admissible",
    eligibleFail: "Non admissible",
    rationale: "Justification",
    waitingProfile: "Complétez votre profil d'organisation pour activer l'évaluation IA.",
    waitingEnrich: "En attente d'enrichissement…",
    evaluating: "L'IA évalue l'adéquation…",
  },
} as const;

export function FitEvaluation(props: Props) {
  const L = props.fr ? LABELS.fr : LABELS.en;
  const e = props.evaluation;
  const t = e ? tier(e.fit_score) : null;
  const VerdictIcon = t?.icon;

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
                  <Icon className={cn(
                    "h-5 w-5 shrink-0",
                    state === "done" && "text-emerald-600",
                    state === "active" && "text-primary animate-spin",
                    state === "pending" && "text-muted-foreground/40",
                  )} />
                  {i < STAGE_ORDER.length - 1 && (
                    <div className={cn(
                      "h-0.5 flex-1 rounded transition-colors",
                      stageReached(STAGE_ORDER[i + 1], props) !== "pending" ? "bg-emerald-500/60" : "bg-border",
                    )} />
                  )}
                </div>
                <div className="mt-1.5">
                  <p className={cn(
                    "text-xs font-medium",
                    state === "pending" && "text-muted-foreground/60",
                  )}>{L.stages[s]}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{L.stageDesc[s]}</p>
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
                <span className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border",
                  e.eligibility_pass
                    ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                    : "border-rose-500/30 text-rose-700 dark:text-rose-400 bg-rose-500/10",
                )}>
                  {e.eligibility_pass ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                  {e.eligibility_pass ? L.eligiblePass : L.eligibleFail}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{L.rationale}</p>
              <p className="text-sm text-foreground/90 leading-relaxed mt-0.5">
                {(props.fr ? e.rationale_fr : e.rationale_en) || e.rationale_en}
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
    </div>
  );
}
