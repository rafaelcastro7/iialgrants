// Live chain-of-thought panel. Polls agent_trace_steps every 1s while the
// agent run is active and renders each step (scrape, regex, LLM, validation)
// in chronological order with status icon, message, payload, and duration.
// Each step name has a human-readable description surfaced via tooltip so a
// non-technical user understands what the agent is doing in real time.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgentTrace } from "@/lib/traces.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  AlertTriangle,
  Play,
  Flag,
  HelpCircle,
  Link2,
  Check,
} from "lucide-react";

type Status = "info" | "ok" | "warn" | "error" | "start" | "done";

// Human-readable explanation of every agent step.
// Keep titles short (chip label) and descriptions one sentence (tooltip).
const STEP_INFO: Record<string, { title: string; desc: string }> = {
  init: {
    title: "Initialize",
    desc: "Start the agent run, allocate a trace id and prepare context for this grant.",
  },
  load: {
    title: "Load grant + org",
    desc: "Fetch the grant record and your organization profile from the database.",
  },
  gate: {
    title: "Eligibility gate",
    desc: "Hard rules that decide whether the grant is allowed to proceed (state, eligibility flags, archiving).",
  },
  inventory: {
    title: "Field inventory",
    desc: "Check which fields (amount, deadline, sectors, eligibility) are already known before scraping.",
  },
  scrape: {
    title: "Web scrape",
    desc: "Download the program page (Firecrawl → fetch fallback) and extract clean Markdown.",
  },
  extractors: {
    title: "Deterministic pass",
    desc: "Run regex + chrono + rule-based extractors — zero LLM cost, fully traceable.",
  },
  regex_amount: {
    title: "Regex · amount",
    desc: "Parse dollar figures and ranges from the page text using strict patterns.",
  },
  chrono_deadline: {
    title: "Chrono · deadline",
    desc: "Detect application deadlines via natural-language date parsing.",
  },
  rule_eligibility: {
    title: "Rules · eligibility",
    desc: "Match eligibility tags (nonprofit, for-profit, indigenous, sector…) against a curated tag list.",
  },
  rule_sectors: {
    title: "Rules · sectors",
    desc: "Tag program sectors (climate, smart cities, applied research…) via keyword rules.",
  },
  llm_gap: {
    title: "LLM gap analysis",
    desc: "List fields still missing after the deterministic pass — only these are sent to the LLM.",
  },
  llm_providers: {
    title: "Provider check",
    desc: "List available local models and Firecrawl JSON extraction.",
  },
  llm_cascade: {
    title: "Free LLM cascade",
    desc: "Call local models in order (primary → fallback).",
  },
  llm_validate: {
    title: "Validate LLM output",
    desc: "Per-field schema check + grounded-quote verification: the LLM must cite exact text from the page.",
  },
  translate: {
    title: "Translate (FR→EN)",
    desc: "Translate any French value to English before saving so the catalog stays mono-lingual.",
  },
  translate_sectors: {
    title: "Translate sectors",
    desc: "Translate French sector labels to their canonical English names.",
  },
  translate_eligibility: {
    title: "Translate eligibility",
    desc: "Translate French eligibility values to English.",
  },
  schema: {
    title: "Schema validation",
    desc: "Final Zod check that the assembled grant record matches the database schema.",
  },
  rules_load: {
    title: "Load fit rules",
    desc: "Load your customized screening rules (F1–F6 from the IIAL SOP) for this evaluation.",
  },
  rules_summary: {
    title: "Rules summary",
    desc: "Apply each rule and record pass / fail / skip with the reason.",
  },
  llm_call: {
    title: "LLM verdict",
    desc: "Ask the LLM for a 0–100 fit score and a written rationale, grounded in the grant text.",
  },
  parse: {
    title: "Parse verdict",
    desc: "Validate the LLM's JSON output against the verdict schema.",
  },
  combine: {
    title: "Combine scores",
    desc: "Blend the rule-based score and the LLM score using your weight settings to produce the final fit.",
  },
  rationale: {
    title: "Rationale",
    desc: "The LLM's written explanation for the verdict, in English.",
  },
  persist: {
    title: "Persist evaluation",
    desc: "Upsert the evaluation row (fit score, eligibility, rationale, model) into grant_evaluations.",
  },
  commit: {
    title: "Commit",
    desc: "Update the grant status (scored / archived) and write the final fit score.",
  },
  skip: {
    title: "Skip",
    desc: "This step was skipped — message explains why (already processed, max attempts, etc.).",
  },
  done: { title: "Done", desc: "Agent run finished successfully." },
};

function stepInfo(step: string) {
  return (
    STEP_INFO[step] ?? {
      title: step,
      desc: "Pipeline step — see message and payload below for details.",
    }
  );
}

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok" || s === "done")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />;
  if (s === "error")
    return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  if (s === "start") return <Play className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />;
  return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
}

export function AgentTracePanel({
  runId,
  agentLabel,
  open,
  onOpenChange,
  fr,
  focusStep,
  onFocusStep,
}: {
  runId: string | null;
  agentLabel: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fr: boolean;
  focusStep?: string | null;
  onFocusStep?: (step: string | null) => void;
}) {
  const fetchTrace = useServerFn(getAgentTrace);
  const { data } = useQuery({
    queryKey: ["agent-trace", runId],
    queryFn: () => (runId ? fetchTrace({ data: { runId } }) : Promise.resolve({ steps: [] })),
    enabled: !!runId && open,
    refetchInterval: (q) => {
      const steps = q.state.data?.steps ?? [];
      const last = steps[steps.length - 1];
      if (
        last &&
        (last.status === "done" || last.status === "error") &&
        (last.step === "commit" || last.step === "done")
      )
        return false;
      return 1000;
    },
    staleTime: 500,
  });

  const steps = useMemo(
    () =>
      (data?.steps ?? []) as Array<{
        id: string;
        step: string;
        status: string;
        message: string | null;
        payload: string | null;
        duration_ms: number | null;
        created_at: string;
      }>,
    [data?.steps],
  );

  const t0Ms = useMemo(() => (steps[0] ? new Date(steps[0].created_at).getTime() : 0), [steps]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Auto-scroll to bottom as new steps stream in, unless a focusStep is pinned.
  useEffect(() => {
    if (focusStep) return;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [steps.length, focusStep]);

  // Scroll the focused step into view and flash a ring when deep-linked.
  useEffect(() => {
    if (!focusStep || !open) return;
    const el = stepRefs.current[focusStep];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusStep, open, steps.length]);

  const lastStatus = steps[steps.length - 1]?.status;
  const lastStep = steps[steps.length - 1]?.step;
  const running = !!runId && lastStatus !== "done" && lastStatus !== "error";
  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, error: 0 };
    for (const s of steps) {
      if (s.status === "ok" || s.status === "done") c.ok++;
      else if (s.status === "warn") c.warn++;
      else if (s.status === "error") c.error++;
    }
    return c;
  }, [steps]);
  const elapsedMs =
    steps.length > 1 ? new Date(steps[steps.length - 1].created_at).getTime() - t0Ms : 0;
  const currentInfo = lastStep ? stepInfo(lastStep) : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
              ) : (
                <Flag className="h-4 w-4 text-emerald-500" />
              )}
              {fr ? "Chaîne de raisonnement —" : "Chain of thought —"}{" "}
              <span className="font-mono text-sm">{agentLabel}</span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              {runId ? (
                <span className="font-mono">run {runId.slice(0, 12)}…</span>
              ) : fr ? (
                "Aucune corrida sélectionnée"
              ) : (
                "No run selected"
              )}
              {steps.length > 0 && (
                <>
                  <span className="ml-2">
                    · {steps.length} {fr ? "étapes" : "steps"}
                  </span>
                  <span className="ml-2 text-emerald-600">✓ {counts.ok}</span>
                  {counts.warn > 0 && <span className="ml-1 text-amber-600">⚠ {counts.warn}</span>}
                  {counts.error > 0 && (
                    <span className="ml-1 text-destructive">✕ {counts.error}</span>
                  )}
                  {elapsedMs > 0 && (
                    <span className="ml-2 tabular-nums">· {(elapsedMs / 1000).toFixed(1)}s</span>
                  )}
                </>
              )}
            </SheetDescription>
            {currentInfo && running && (
              <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium">
                  <Loader2 className="h-3 w-3 animate-spin text-sky-500" />
                  {fr ? "Étape actuelle:" : "Current step:"} {currentInfo.title}
                </div>
                <p className="mt-0.5 text-muted-foreground leading-relaxed">{currentInfo.desc}</p>
              </div>
            )}
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto mt-3 pr-2 space-y-1.5">
            {!runId && (
              <p className="text-xs text-muted-foreground italic py-8 text-center">
                {fr
                  ? "Lancez Enrich ou Évaluer pour voir le raisonnement en direct."
                  : "Trigger Enrich or Evaluate to see live reasoning."}
              </p>
            )}
            {runId && steps.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-8 text-center flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {fr ? "En attente du premier événement…" : "Waiting for first event…"}
              </p>
            )}
            {steps.map((s, i) => {
              const tDelta = t0Ms ? new Date(s.created_at).getTime() - t0Ms : 0;
              let payloadObj: Record<string, unknown> | null = null;
              if (s.payload) {
                try {
                  payloadObj = JSON.parse(s.payload) as Record<string, unknown>;
                } catch {
                  /* ignore */
                }
              }
              const info = stepInfo(s.step);
              // Match by step id (precise) or step name (first occurrence).
              const isFocused = !!focusStep && (focusStep === s.id || focusStep === s.step);
              const copyDeepLink = async (e: React.MouseEvent) => {
                e.stopPropagation();
                const url = new URL(window.location.href);
                url.searchParams.set("step", s.id);
                try {
                  await navigator.clipboard.writeText(url.toString());
                  setCopied(s.id);
                  setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1500);
                } catch {
                  /* ignore */
                }
                onFocusStep?.(s.id);
              };
              return (
                <div
                  key={s.id}
                  ref={(el) => {
                    stepRefs.current[s.id] = el;
                    stepRefs.current[s.step] ??= el;
                  }}
                  className={
                    "border rounded-md p-2 bg-card text-xs transition-shadow " +
                    (isFocused ? "ring-2 ring-sky-500/60 border-sky-500/40" : "")
                  }
                >
                  <div className="flex items-start gap-2">
                    <StatusIcon s={s.status as Status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">
                                {s.step}
                              </Badge>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/70" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                            <div className="font-semibold mb-0.5">{info.title}</div>
                            <div className="opacity-90">{info.desc}</div>
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-muted-foreground text-[10px] hidden sm:inline">
                          {info.title}
                        </span>
                        <span className="text-muted-foreground tabular-nums text-[10px]">
                          +{(tDelta / 1000).toFixed(2)}s
                        </span>
                        {s.duration_ms != null && (
                          <span className="text-muted-foreground tabular-nums text-[10px]">
                            ({s.duration_ms}ms)
                          </span>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={copyDeepLink}
                              className="ml-auto inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label={
                                fr
                                  ? "Copier le lien vers cette étape"
                                  : "Copy deep-link to this step"
                              }
                            >
                              {copied === s.id ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Link2 className="h-3 w-3" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {copied === s.id
                              ? fr
                                ? "Lien copié"
                                : "Link copied"
                              : fr
                                ? "Copier le lien vers cette étape"
                                : "Copy deep-link to this step"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {s.message && <p className="mt-1 leading-relaxed break-words">{s.message}</p>}
                      {payloadObj && Object.keys(payloadObj).length > 0 && (
                        <details className="mt-1.5" open={isFocused}>
                          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                            {fr ? "Détails" : "Details"}
                          </summary>
                          <pre className="mt-1 text-[10px] bg-muted/40 p-1.5 rounded font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(payloadObj, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
