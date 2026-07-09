// EXPRESS detail — simple mode for the proposal drafting page. Same philosophy
// as the grants Express views: one readiness signal, plain per-section status,
// ONE primary action. Full section editing, citations, and critic findings
// live behind "Show full details" (Advanced).
import { CheckCircle2, Circle, Loader2, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProposalReadiness } from "@/lib/proposal-readiness";

const STATUS_ICON = {
  ready: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />,
  partial: <MinusCircle className="h-4 w-4 shrink-0 text-warning" />,
  blocked: <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />,
} as const;

function scoreTone(score: number): string {
  return score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-muted-foreground";
}

function barTone(score: number): string {
  return score >= 80 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-muted-foreground/40";
}

export function ProposalDetailExpress({
  title,
  readiness,
  pending,
  onDraftSection,
  onCritic,
  onSubmit,
  onShowAdvanced,
}: {
  title: string;
  readiness: ProposalReadiness;
  pending: string | null;
  onDraftSection: (sectionId: string) => void;
  onCritic: () => void;
  onSubmit: () => void;
  onShowAdvanced: () => void;
}) {
  const nextSection = readiness.sections.find((s) => s.status !== "ready");
  const readyToSubmit = readiness.score >= 80 && readiness.openCriticalRequirements.length === 0;
  const readyCount = readiness.sections.filter((s) => s.status === "ready").length;
  const totalSections = readiness.sections.length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Proposal readiness
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {readyCount} of {totalSections} section{totalSections === 1 ? "" : "s"} ready
                {readyToSubmit ? " · ready to submit" : ""}
              </p>
            </div>
            <div className={`text-3xl font-bold tabular-nums ${scoreTone(readiness.score)}`}>
              {readiness.score}%
            </div>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${barTone(readiness.score)}`}
              style={{ width: `${Math.min(100, Math.max(0, readiness.score))}%` }}
            />
          </div>

          {readiness.openCriticalRequirements.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive">Missing before you submit</p>
              <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                {readiness.openCriticalRequirements.slice(0, 4).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sections</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {readiness.sections.map((s) => (
              <li key={s.sectionId} className="flex items-center gap-2 text-sm">
                {STATUS_ICON[s.status]}
                <span className="flex-1 truncate">{s.heading}</span>
                <Badge
                  variant={
                    s.status === "ready"
                      ? "default"
                      : s.status === "partial"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-[10px]"
                >
                  {s.status === "ready" ? "Ready" : s.status === "partial" ? "Needs work" : "Empty"}
                </Badge>
              </li>
            ))}
            {readiness.sections.length === 0 && (
              <li className="text-xs text-muted-foreground">No sections planned yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* ONE primary action */}
      <div className="flex items-center gap-2 pt-2">
        {readyToSubmit ? (
          <Button disabled={pending === "submit"} onClick={onSubmit}>
            {pending === "submit" ? "Submitting…" : "Submit proposal"}
          </Button>
        ) : nextSection ? (
          <Button
            disabled={pending === nextSection.sectionId}
            onClick={() => onDraftSection(nextSection.sectionId)}
          >
            {pending === nextSection.sectionId ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Drafting…
              </>
            ) : (
              `Draft "${nextSection.heading}"`
            )}
          </Button>
        ) : (
          <Button disabled={pending === "critic"} onClick={onCritic}>
            {pending === "critic" ? "Reviewing…" : "Run quality review"}
          </Button>
        )}
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
