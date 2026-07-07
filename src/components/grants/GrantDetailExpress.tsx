// EXPRESS detail — the simple mode of the grant detail page. Same philosophy
// as GrantExpressView: plain language, the facts a basic user actually needs,
// one primary action. Everything else (axis breakdown, raw eligibility JSON,
// audit trail, agent traces) lives behind the "Advanced" toggle.
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MAX_ENRICH_ATTEMPTS } from "@/agents/pipeline-stages.shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAY_MS = 86_400_000;

type Requirement = { category: string; requirement: string; isCritical: boolean };

export function GrantDetailExpress({
  title,
  funderName,
  funderId,
  status,
  summary,
  amountMin,
  amountMax,
  deadline,
  url,
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
  status: string;
  summary: string | null;
  amountMin: number | null;
  amountMax: number | null;
  deadline: string | null;
  url: string;
  evaluation: { fit_score: number; eligibility_pass: boolean; rationale_en: string } | null;
  requirements: Requirement[] | null;
  enrichAttempts?: number | null;
  enrichLastError?: string | null;
  busy: string | null;
  onEvaluate: () => void;
  onDraft: () => void;
  onShowAdvanced: () => void;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(n);
  const amountLabel =
    amountMin != null && amountMax != null
      ? `${fmt(amountMin)} – ${fmt(amountMax)}`
      : amountMax != null
        ? `Up to ${fmt(amountMax)}`
        : amountMin != null
          ? `From ${fmt(amountMin)}`
          : "Not published";

  let deadlineLabel = "Rolling / no deadline";
  let deadlineTone: "ok" | "soon" | "urgent" = "ok";
  if (deadline) {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / DAY_MS);
    if (!Number.isNaN(days)) {
      if (days < 0) {
        deadlineLabel = "Deadline passed";
        deadlineTone = "urgent";
      } else if (days === 0) {
        deadlineLabel = "Closes today";
        deadlineTone = "urgent";
      } else if (days <= 7) {
        deadlineLabel = `Closes in ${days} day${days === 1 ? "" : "s"}`;
        deadlineTone = "urgent";
      } else if (days <= 30) {
        deadlineLabel = `Closes in ${days} days`;
        deadlineTone = "soon";
      } else {
        deadlineLabel = `Closes ${new Date(deadline).toLocaleDateString("en-CA")}`;
      }
    }
  }

  const fitPct = evaluation ? Math.round(evaluation.fit_score * 100) : null;
  const criticalReqs = (requirements ?? []).filter((r) => r.isCritical);

  const canDraft = ["scored", "shortlisted", "in_proposal"].includes(status);
  const needsEval = status === "discovered" || (status === "enriched" && !evaluation);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {funderId ? (
          <Link
            to="/funders/$funderId"
            params={{ funderId }}
            className="mt-1 inline-block text-sm text-primary hover:underline"
          >
            {funderName}
          </Link>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{funderName}</p>
        )}
      </div>

      {status === "discovered" && (enrichAttempts ?? 0) >= MAX_ENRICH_ATTEMPTS && (
        <Card className="border-rose-400/50 bg-rose-50/60 dark:bg-rose-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium">We could not load this grant's details</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatic retries stopped after {MAX_ENRICH_ATTEMPTS} failed attempts.
                {enrichLastError ? ` Last error: ${enrichLastError}` : ""} Open the official page
                directly, or switch to Advanced to retry manually.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold tabular-nums">{amountLabel}</span>
              <span
                className={`inline-flex items-center gap-1 text-xs ${
                  deadlineTone === "urgent"
                    ? "text-rose-600 font-medium"
                    : deadlineTone === "soon"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> {deadlineLabel}
              </span>
            </div>
            {fitPct != null && (
              <div className="text-right">
                <div
                  className={`text-2xl font-bold tabular-nums ${
                    fitPct >= 70
                      ? "text-emerald-600"
                      : fitPct >= 45
                        ? "text-amber-600"
                        : "text-slate-400"
                  }`}
                >
                  {fitPct}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  match
                </div>
              </div>
            )}
          </div>

          {evaluation &&
            (evaluation.eligibility_pass ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <CheckCircle2 className="h-4 w-4" /> You can apply
              </p>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-sm text-rose-600 font-medium">
                <XCircle className="h-4 w-4" /> Likely not eligible
              </p>
            ))}
          {!evaluation && (
            <Badge variant="secondary" className="text-[10px]">
              Not checked yet
            </Badge>
          )}

          {evaluation?.rationale_en && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {evaluation.rationale_en}
            </p>
          )}
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
              What this grant is
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">{summary}</CardContent>
        </Card>
      )}

      {criticalReqs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Before you apply, prepare</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {criticalReqs.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Badge variant="destructive" className="text-[9px] mt-0.5 shrink-0">
                    required
                  </Badge>
                  {r.requirement}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ONE primary action */}
      <div className="flex items-center gap-2 pt-2">
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
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          Official page <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={onShowAdvanced}
          className="ml-auto text-xs text-muted-foreground hover:underline"
        >
          Show full details →
        </button>
      </div>
    </div>
  );
}
