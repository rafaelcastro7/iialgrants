import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { selfCheckGrant } from "@/lib/grant-self-check.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";

export function SelfCheckBanner({
  grantId,
  onRetry,
  retrying,
}: { grantId: string; onRetry?: () => void; retrying?: boolean }) {
  const fn = useServerFn(selfCheckGrant);
  const [open, setOpen] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ["self-check", grantId],
    queryFn: () => fn({ data: { grantId } }),
    refetchInterval: retrying ? 3_000 : 30_000,
  });
  if (!data) return null;

  const tone = data.overall === "ok"
    ? "border-green-500/40 bg-green-500/5"
    : data.overall === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-destructive/40 bg-destructive/5";

  const Icon = data.overall === "ok" ? CheckCircle2 : data.overall === "warn" ? AlertTriangle : AlertCircle;
  const iconColor = data.overall === "ok" ? "text-green-600" : data.overall === "warn" ? "text-amber-600" : "text-destructive";

  const filledCount = Object.values(data.fields).filter(Boolean).length;
  const totalFields = Object.keys(data.fields).length;

  return (
    <div className={`rounded-md border ${tone} px-3 py-2 text-xs`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
          <span className="font-medium">
            {data.overall === "ok" ? "Data verification complete" : data.overall === "warn" ? "Partially verified" : "Source retrieval issue"}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {filledCount}/{totalFields} fields · {data.evidence_count} citations
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {data.issues.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen(!open)}>
              {open ? "Hide" : `${data.issues.length} issue${data.issues.length === 1 ? "" : "s"}`}
            </Button>
          )}
          {data.overall !== "ok" && onRetry && (
            <Button size="sm" variant="outline" className="h-7" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrieving..." : "Retry retrieval"}
            </Button>
          )}
        </div>
      </div>
      {open && data.issues.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6">
          {data.issues.map((i) => (
            <li key={i.id} className="list-disc">
              <span className={i.level === "error" ? "text-destructive" : i.level === "warn" ? "text-amber-700" : ""}>
                {i.label}
              </span>
              {i.hint && <span className="text-muted-foreground"> — {i.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      <span className="hidden" onClick={() => refetch()} />
    </div>
  );
}
