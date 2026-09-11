import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { checkOrgRulesDrift } from "@/lib/fit-rules.functions";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { useState } from "react";

/**
 * Surfaces inconsistencies between the org profile and the stored screening
 * rules. Renders nothing when there are no issues or when the user hasn't
 * customized either, so it never shows false positives.
 */
export function OrgRulesDriftBanner() {
  const fn = useServerFn(checkOrgRulesDrift);
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["org-rules-drift"],
    queryFn: () => fn(),
    // Re-check every 5 minutes — drift changes when either profile or rules
    // are saved, and both invalidate different query keys.
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  if (dismissed || !data?.issues?.length) return null;

  const hasError = data.issues.some((i) => i.level === "error");
  const tone = hasError
    ? "border-destructive/40 bg-destructive/5"
    : "border-amber-500/40 bg-amber-500/5";
  const iconColor = hasError ? "text-destructive" : "text-amber-600";

  return (
    <div className={`mb-4 rounded-md border ${tone} px-3 py-2 text-xs`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className={`h-4 w-4 ${iconColor} shrink-0 mt-0.5`} />
          <div className="space-y-1">
            <span className="font-medium">
              {hasError
                ? "Org profile ↔ screening rules conflict"
                : "Screening rules may be out of sync with your org profile"}
            </span>
            <ul className="space-y-0.5 text-muted-foreground">
              {data.issues.map((issue) => (
                <li key={issue.id} className="list-disc ml-4">
                  <span
                    className={
                      issue.level === "error"
                        ? "text-destructive"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {issue.label}
                  </span>
                  {issue.hint && <span className="text-muted-foreground"> — {issue.hint}</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 pt-1">
              <Link
                to="/org"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Edit org profile <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                to="/fit-rules"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Edit screening rules <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
