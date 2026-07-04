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
  ready: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
  partial: <MinusCircle className="h-4 w-4 text-amber-600 shrink-0" />,
  blocked: <Circle className="h-4 w-4 text-slate-300 shrink-0" />,
} as const;

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

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Proposal readiness</p>
            <div
              className={`text-3xl font-bold tabular-nums ${
                readiness.score >= 80
                  ? "text-emerald-600"
                  : readiness.score >= 50
                    ? "text-amber-600"
                    : "text-slate-400"
              }`}
            >
              {readiness.score}%
            </div>
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
