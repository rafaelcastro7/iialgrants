// Inline, expanded evaluation breakdown rendered directly on the grant page.
// Pulls the same data as /grants/$id/audit so users see WHY a grant scored
// what it scored without having to navigate away.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  ExternalLink,
  Brain,
  Gauge,
  Scale,
  ListChecks,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getGrantAudit } from "@/lib/grant-audit.functions";
import type { AxisScore } from "@/agents/fit-rules.shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STATUS_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  fail: <XCircle className="h-4 w-4 text-rose-600" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  skip: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

// Map each rule id to the evidence fields that fed it. Used to surface ONLY
// the spans that actually drove a given rule when the user drills into it.
const RULE_FIELD_MAP: Record<string, string[]> = {
  sop_filter_1_country: ["country", "jurisdiction", "eligibility"],
  sop_filter_2_role: ["eligibility", "applicant_type"],
  sop_filter_3_money: ["amount_cad_min", "amount_cad_max", "amount", "funding"],
  sop_filter_4_strategic: ["sectors", "themes", "summary"],
  sop_filter_5_runway: ["deadline", "intake", "rolling"],
  sop_filter_6_effort: ["cost_share", "match", "effort"],
  amount_min: ["amount_cad_min", "amount_cad_max", "amount"],
  amount_max: ["amount_cad_min", "amount_cad_max", "amount"],
  deadline: ["deadline", "intake"],
  keywords_required: ["summary", "title", "sectors"],
  keywords_excluded: ["summary", "title", "sectors"],
};

export function EvaluationDetail({ grantId }: { grantId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["grant-audit", grantId],
    queryFn: () => getGrantAudit({ data: { id: grantId } }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading evaluation details…
        </CardContent>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-destructive">
          {(error as Error).message}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { rules, evaluation, evidence, verdict } = data;
  const axes = (evaluation as { axis_breakdown?: AxisScore[] } | null)?.axis_breakdown ?? null;
  const blockingFail = rules.checks.find((c) => c.status === "fail" && c.hard);
  const llmPct = evaluation?.fit_score != null ? Math.round(evaluation.fit_score * 100) : null;
  const passes = rules.checks.filter((c) => c.status === "pass").length;
  const fails = rules.checks.filter((c) => c.status === "fail").length;
  const skips = rules.checks.filter((c) => c.status === "skip").length;

  const verdictBadge =
    verdict === "accepted" ? (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">Accepted</Badge>
    ) : verdict === "rejected" ? (
      <Badge variant="destructive">Rejected</Badge>
    ) : (
      <Badge variant="secondary">Pending</Badge>
    );

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Evaluation breakdown
          </CardTitle>
          <div className="flex items-center gap-2">
            {verdictBadge}
            <Button asChild size="sm" variant="ghost">
              <Link to="/grants/$id/audit" params={{ id: grantId }}>
                Full audit →
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Score breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Stat
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="Rule score"
            value={`${Math.round(rules.rule_score)}/100`}
          />
          <Stat
            icon={<Brain className="h-3.5 w-3.5" />}
            label="LLM fit"
            value={llmPct != null ? `${llmPct}/100` : "—"}
          />
          <Stat
            icon={<Scale className="h-3.5 w-3.5" />}
            label="Threshold"
            value={`≥ ${rules.threshold_fit_pass}`}
          />
          <Stat
            icon={<ListChecks className="h-3.5 w-3.5" />}
            label="Checks"
            value={`${passes}✓ ${fails}✗ ${skips}∅`}
          />
        </div>

        {/* Transparent multi-axis breakdown — the "why" across named dimensions */}
        {axes && axes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
              Fit by dimension
            </p>
            <ul className="space-y-1.5">
              {axes.map((a) => (
                <AxisBar key={a.axis} axis={a} />
              ))}
            </ul>
          </div>
        )}

        {/* Why */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
            Why this verdict
          </p>
          {blockingFail ? (
            <p>
              <span className="text-rose-600 font-semibold">Hard-fail</span> on{" "}
              <span className="font-medium">{blockingFail.label}</span> — {blockingFail.detail}.
            </p>
          ) : evaluation && llmPct != null ? (
            <p>
              Combined fit <b>{llmPct}</b> vs threshold <b>{rules.threshold_fit_pass}</b>. Rule
              score {Math.round(rules.rule_score)}, LLM weight {Math.round(rules.weight_llm * 100)}
              %.
            </p>
          ) : (
            <p>
              Not evaluated yet. Current rule score: <b>{Math.round(rules.rule_score)}</b>.
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span>
              Detected role: <b>{rules.detected_role}</b>
            </span>
            {rules.cost_share_pct != null && (
              <span>
                · Org cost-share: <b>{rules.cost_share_pct}%</b>
              </span>
            )}
            {rules.rolling_intake && <span>· Rolling intake</span>}
          </div>
        </div>

        {/* Rules list — click to drill into evidence + math */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Rules evaluated ({rules.checks.length}) · click a rule to inspect
          </p>
          <ul className="divide-y rounded-md border">
            {rules.checks.map((c) => (
              <RuleRow
                key={c.id}
                check={c}
                evidence={evidence}
                ruleScore={rules.rule_score}
                weightLlm={rules.weight_llm}
                llmPct={llmPct}
                threshold={rules.threshold_fit_pass}
                totalEvaluable={
                  rules.checks.filter((x) => x.status === "pass" || x.status === "fail").length
                }
              />
            ))}
            {rules.checks.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">No rules triggered.</li>
            )}
          </ul>
        </div>

        {/* LLM rationale */}
        {evaluation?.rationale_en && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> AI rationale
              <span className="text-[10px] normal-case font-normal">({evaluation.model})</span>
            </p>
            <div className="text-sm whitespace-pre-wrap rounded-md border bg-card p-3 leading-relaxed">
              {evaluation.rationale_en}
            </div>
          </div>
        )}

        {/* Evidence preview */}
        {evidence.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
              Evidence used ({evidence.length})
            </p>
            <ul className="divide-y rounded-md border max-h-56 overflow-y-auto">
              {evidence.slice(0, 8).map((e, i) => (
                <li key={i} className="px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {e.agent}
                    </Badge>
                    <span className="font-medium">{e.field}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {e.extraction_method}
                    </Badge>
                    <span className="text-muted-foreground">
                      conf {Math.round(Number(e.confidence) * 100)}%
                    </span>
                    {e.source_url && (
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-primary hover:underline inline-flex items-center gap-1"
                      >
                        source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-muted-foreground italic truncate" title={e.snippet ?? ""}>
                    "{e.snippet}"
                  </div>
                </li>
              ))}
            </ul>
            {evidence.length > 8 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Showing 8 of {evidence.length}.{" "}
                <Link to="/grants/$id/audit" params={{ id: grantId }} className="underline">
                  See all in audit →
                </Link>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AxisBar({ axis }: { axis: AxisScore }) {
  const pct = axis.score == null ? 0 : axis.score * 10;
  const barColor =
    axis.status === "pass"
      ? "bg-emerald-500"
      : axis.status === "partial"
        ? "bg-amber-500"
        : axis.status === "fail"
          ? "bg-rose-500"
          : "bg-slate-300";
  const reason = axis.reasons[0] ?? "";
  return (
    <li className="text-xs" title={axis.reasons.join(" · ")}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-medium flex items-center gap-1.5">
          {axis.label}
          {axis.hardFail && (
            <Badge variant="destructive" className="text-[9px] py-0">
              blocker
            </Badge>
          )}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {axis.score == null ? "N/A" : `${axis.score}/10`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {reason && <p className="text-muted-foreground mt-0.5 truncate">{reason}</p>}
    </li>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

type EvidenceItem = {
  agent: string;
  field: string;
  value: unknown;
  source_url: string | null;
  snippet: string | null;
  extraction_method: string;
  confidence: number | string;
};

function RuleRow({
  check,
  evidence,
  ruleScore,
  weightLlm,
  llmPct,
  threshold,
  totalEvaluable,
}: {
  check: {
    id: string;
    label: string;
    status: "pass" | "fail" | "warn" | "skip";
    hard: boolean;
    detail: string;
  };
  evidence: EvidenceItem[];
  ruleScore: number;
  weightLlm: number;
  llmPct: number | null;
  threshold: number;
  totalEvaluable: number;
}) {
  const [open, setOpen] = useState(false);

  // Per-rule evidence: match by field name OR by agent==evaluator referencing this rule id.
  const fields = RULE_FIELD_MAP[check.id] ?? [];
  const related = evidence.filter((e) => {
    const f = (e.field ?? "").toLowerCase();
    return (
      fields.some((wanted) => f.includes(wanted)) ||
      (e.snippet ?? "").toLowerCase().includes(check.id)
    );
  });

  // Math contribution: each evaluable rule contributes 1/N of rule_score (0–100).
  const perRulePoints = totalEvaluable > 0 ? Math.round(100 / totalEvaluable) : 0;
  const contributed = check.status === "pass" ? perRulePoints : 0;
  const ruleWeightPct = Math.round((1 - weightLlm) * 100);
  const llmWeightPct = Math.round(weightLlm * 100);
  const combined =
    llmPct != null ? Math.round(weightLlm * llmPct + (1 - weightLlm) * ruleScore) : null;

  return (
    <li className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-3 py-2 hover:bg-muted/40 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
        )}
        {STATUS_ICON[check.status]}
        <div className="flex-1 min-w-0">
          <div className="font-medium flex items-center gap-1.5">
            {check.label}
            {check.hard && (
              <Badge variant="outline" className="text-[10px] py-0">
                hard
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{check.detail}</div>
        </div>
        <Badge
          variant={
            check.status === "fail"
              ? "destructive"
              : check.status === "pass"
                ? "default"
                : "secondary"
          }
          className="text-[10px]"
        >
          {check.status}
        </Badge>
      </button>

      {open && (
        <div className="px-3 pb-3 pl-12 space-y-3 bg-muted/20 border-t">
          {/* Exact math */}
          <div className="rounded-md border bg-card p-2.5 text-xs space-y-1">
            <p className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
              Calculation
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
              <span className="text-muted-foreground">Rule contribution</span>
              <span>
                <b>{contributed}</b> / {perRulePoints} pts (status: {check.status})
              </span>
              <span className="text-muted-foreground">Rule score (all rules)</span>
              <span>
                <b>{Math.round(ruleScore)}</b>/100 · weight {ruleWeightPct}%
              </span>
              <span className="text-muted-foreground">LLM fit</span>
              <span>
                {llmPct != null ? (
                  <>
                    <b>{llmPct}</b>/100 · weight {llmWeightPct}%
                  </>
                ) : (
                  <span className="italic">not yet scored</span>
                )}
              </span>
              <span className="text-muted-foreground">Combined</span>
              <span>
                {combined != null ? (
                  <>
                    <b>{combined}</b>/100 vs threshold {threshold} →{" "}
                    {combined >= threshold ? (
                      <span className="text-emerald-600 font-semibold">PASS</span>
                    ) : (
                      <span className="text-rose-600 font-semibold">FAIL</span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {check.hard && check.status === "fail" && (
              <p className="text-rose-600 pt-1">
                ⚠ Hard-fail rule — overrides combined score regardless of LLM fit.
              </p>
            )}
            {check.status === "skip" && (
              <p className="text-muted-foreground pt-1">
                Skipped rules do not affect the rule score.
              </p>
            )}
          </div>

          {/* Evidence */}
          <div>
            <p className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground mb-1">
              Evidence that fired this rule ({related.length})
            </p>
            {related.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No evidence span tagged for fields: {fields.join(", ") || "—"}. The rule fired on
                derived values from the grant record.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {related.map((e, i) => (
                  <li key={i} className="px-2.5 py-1.5 text-xs space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {e.agent}
                      </Badge>
                      <span className="font-medium">{e.field}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {e.extraction_method}
                      </Badge>
                      <span className="text-muted-foreground">
                        conf {Math.round(Number(e.confidence) * 100)}%
                      </span>
                      {e.source_url && (
                        <a
                          href={e.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-primary hover:underline inline-flex items-center gap-1"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {e.snippet && (
                      <div className="text-muted-foreground italic" title={e.snippet}>
                        "{e.snippet}"
                      </div>
                    )}
                    {e.value != null && (
                      <div className="font-mono text-[11px] text-foreground/80">
                        value: {typeof e.value === "string" ? e.value : JSON.stringify(e.value)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
