import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGrantEvidence } from "@/lib/evidence.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ShieldCheck, Bot, Regex, FileCheck2, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";

type Span = {
  id: string;
  agent: string;
  field: string;
  value: unknown;
  source_url: string;
  snippet: string;
  extraction_method: string;
  confidence: number;
  model: string | null;
  created_at: string;
};

const METHOD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  regex: Regex,
  chrono: Calendar,
  rule: FileCheck2,
  firecrawl_json: ShieldCheck,
  llm: Bot,
  manual: ShieldCheck,
};

function confColor(c: number): string {
  if (c >= 0.9) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (c >= 0.7) return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

export function EvidencePanel({
  grantId, field, open, onOpenChange,
}: {
  grantId: string;
  field: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const fetchEvidence = useServerFn(getGrantEvidence);
  const { data, isLoading, error } = useQuery({
    queryKey: ["evidence", grantId, field],
    queryFn: () => fetchEvidence({ data: { grantId } }),
    enabled: open && !!field,
  });

  const spans: Span[] = field && data?.byField?.[field]
    ? (data.byField[field] as unknown as Span[])
    : (field?.startsWith("eligibility")
        ? Object.entries(data?.byField ?? {})
            .filter(([k]) => k.startsWith("eligibility"))
            .flatMap(([, v]) => v as unknown as Span[])
        : field?.startsWith("sectors")
        ? Object.entries(data?.byField ?? {})
            .filter(([k]) => k.startsWith("sectors"))
            .flatMap(([, v]) => v as unknown as Span[])
        : []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Evidence for <span className="font-mono">{field}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Source citations supporting this field.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {isLoading && <p className="text-xs text-muted-foreground">{t("app.loading")}...</p>}
          {error && <p className="text-xs text-destructive">{String(error)}</p>}
          {!isLoading && spans.length === 0 && (
            <p className="text-xs text-muted-foreground">No linked citation is currently available for this field.</p>
          )}
          {spans.map((s) => {
            const Icon = METHOD_ICON[s.extraction_method] ?? Bot;
            return (
              <div key={s.id} className="rounded-md border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="font-medium">{s.extraction_method}</span>
                    {s.model && <span className="text-muted-foreground"> · {s.model}</span>}
                    <span className="text-muted-foreground"> · {s.agent}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${confColor(s.confidence)}`}>
                    {Math.round(s.confidence * 100)}% confidence
                  </Badge>
                </div>

                <div className="text-sm font-medium tabular-nums">
                  {s.value == null
                    ? "—"
                    : typeof s.value === "object"
                    ? JSON.stringify(s.value)
                    : String(s.value)}
                </div>

                <blockquote className="text-xs leading-relaxed text-muted-foreground border-l-2 border-primary/40 pl-3 italic">
                  "{s.snippet}"
                </blockquote>

                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline break-all"
                >
                  {s.source_url} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(s.created_at).toLocaleString("en-CA")}
                </p>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function EvidenceChip({
  field, label, onClick, count,
}: {
  field: string;
  label: React.ReactNode;
  onClick: (field: string) => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(field)}
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors"
      title={`View citations for ${field}`}
    >
      <ShieldCheck className="h-3 w-3" />
      {label}
      {count != null && count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
    </button>
  );
}
