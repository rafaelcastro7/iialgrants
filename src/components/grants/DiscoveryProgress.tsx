import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDiscoveryJobStatus } from "@/lib/grants.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  X,
  Download,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";

type FunderState = {
  funder_id: string;
  funder_name: string;
  status: "queued" | "running" | "succeeded" | "failed" | "degraded";
  attempts: number;
  inserted: number;
  seenAgain: number;
  engine?: string;
  lastError?: string;
  latency_ms?: number;
};

type ErrorCategory =
  | "timeout"
  | "rate_limit"
  | "http"
  | "parse"
  | "auth"
  | "network"
  | "llm"
  | "other";

function categorizeError(msg: string): { category: ErrorCategory; hint: string; hintFr: string } {
  const m = msg.toLowerCase();
  if (m.includes("timeout") || m.includes("timed out") || m.includes("etimedout")) {
    return {
      category: "timeout",
      hint: "Source took >90s. Try fewer funders or increase timeout.",
      hintFr: "La source a pris >90s. Essayez moins de fournisseurs ou augmentez le délai.",
    };
  }
  if (m.includes("429") || m.includes("rate") || m.includes("quota")) {
    return {
      category: "rate_limit",
      hint: "Rate-limited. Wait a minute before retrying.",
      hintFr: "Limite atteinte. Attendez une minute avant de réessayer.",
    };
  }
  if (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("unauthor") ||
    m.includes("forbidden") ||
    m.includes("api key")
  ) {
    return {
      category: "auth",
      hint: "Auth failed. Check Firecrawl / local Supabase credentials.",
      hintFr: "Échec d'authentification. Vérifiez les clés Firecrawl / Supabase local.",
    };
  }
  if (m.includes("404") || m.includes("not found")) {
    return {
      category: "http",
      hint: "Source URL returned 404. Update funder.source_url.",
      hintFr: "URL source retourne 404. Mettez à jour funder.source_url.",
    };
  }
  if (
    m.includes("5") &&
    (m.includes("500") || m.includes("502") || m.includes("503") || m.includes("504"))
  ) {
    return {
      category: "http",
      hint: "Upstream server error. Retry later.",
      hintFr: "Erreur serveur en amont. Réessayez plus tard.",
    };
  }
  if (m.includes("json") || m.includes("parse") || m.includes("schema") || m.includes("zod")) {
    return {
      category: "parse",
      hint: "LLM output failed schema validation. Inspect run metadata.",
      hintFr: "Sortie LLM invalide. Inspectez les métadonnées de la corrida.",
    };
  }
  if (m.includes("fetch") || m.includes("network") || m.includes("econn") || m.includes("dns")) {
    return {
      category: "network",
      hint: "Network failure reaching the source.",
      hintFr: "Échec réseau vers la source.",
    };
  }
  if (m.includes("gemini") || m.includes("llm") || m.includes("model")) {
    return {
      category: "llm",
      hint: "LLM call failed. Try again or fall back to Gemini Pro.",
      hintFr: "Appel LLM échoué. Réessayez ou utilisez Gemini Pro.",
    };
  }
  return {
    category: "other",
    hint: "See Event Log for full trace.",
    hintFr: "Voir le journal d'événements pour la trace complète.",
  };
}

function StatusIcon({ s }: { s: FunderState["status"] }) {
  if (s === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (s === "running" || s === "degraded")
    return <Loader2 className="h-3.5 w-3.5 text-sky-500 animate-spin" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

type ViewFilter = "all" | "queued" | "running" | "succeeded" | "failed";

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DiscoveryProgress({
  jobId,
  queued,
  fr,
  onClose,
}: {
  jobId: string;
  queued: number;
  fr: boolean;
  onClose: () => void;
}) {
  const fetchStatus = useServerFn(getDiscoveryJobStatus);
  const [view, setView] = useState<ViewFilter>("all");
  const { data, error } = useQuery({
    queryKey: ["discovery-job", jobId],
    queryFn: () => fetchStatus({ data: { jobId } }),
    refetchInterval: (q) => (q.state.data?.status === "completed" ? false : 3_000),
    staleTime: 1_000,
  });

  const status = data?.status ?? "queued";
  const perFunder = useMemo(() => (data?.perFunder ?? []) as FunderState[], [data?.perFunder]);
  const processed = perFunder.filter(
    (f) => f.status === "succeeded" || f.status === "failed",
  ).length;
  const total = data?.fundersQueued || queued || perFunder.length || 1;
  const pct = Math.round((processed / total) * 100);

  const counts = useMemo(() => {
    const c = { all: perFunder.length, queued: 0, running: 0, succeeded: 0, failed: 0 };
    for (const f of perFunder) {
      if (f.status === "succeeded") c.succeeded++;
      else if (f.status === "failed") c.failed++;
      else if (f.status === "running" || f.status === "degraded") c.running++;
      else c.queued++;
    }
    return c;
  }, [perFunder]);

  // Group errors by category for an actionable summary.
  const errorGroups = useMemo(() => {
    const groups = new Map<
      ErrorCategory,
      { hint: string; funders: { name: string; msg: string }[] }
    >();
    for (const f of perFunder) {
      if (f.status !== "failed" || !f.lastError) continue;
      const { category, hint, hintFr } = categorizeError(f.lastError);
      const g = groups.get(category) ?? { hint: fr ? hintFr : hint, funders: [] };
      g.funders.push({ name: f.funder_name, msg: f.lastError });
      groups.set(category, g);
    }
    return [...groups.entries()];
  }, [perFunder, fr]);

  const visible = useMemo(() => {
    if (view === "all") return perFunder;
    return perFunder.filter((f) => {
      if (view === "running") return f.status === "running" || f.status === "degraded";
      if (view === "queued") return f.status === "queued";
      return f.status === view;
    });
  }, [perFunder, view]);

  function exportJson() {
    if (!data) return;
    const payload = {
      jobId,
      status: data.status,
      started_at: data.started_at,
      completed_at: data.completed_at,
      totals: {
        fundersQueued: data.fundersQueued,
        totalInserted: data.totalInserted,
        totalSeenAgain: data.totalSeenAgain,
        totalProcessed: data.totalProcessed,
        evaluated: data.evaluated,
      },
      perFunder,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      "application/json",
      `discovery-${jobId.slice(0, 8)}.json`,
    );
  }
  function exportCsv() {
    const header = [
      "funder_id",
      "funder_name",
      "status",
      "attempts",
      "inserted",
      "seen_again",
      "engine",
      "latency_ms",
      "last_error",
    ];
    const rows = perFunder.map((f) => [
      f.funder_id,
      f.funder_name,
      f.status,
      f.attempts,
      f.inserted,
      f.seenAgain,
      f.engine ?? "",
      f.latency_ms ?? "",
      (f.lastError ?? "").replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c)}"`).join(",")).join("\n");
    downloadBlob(csv, "text/csv", `discovery-${jobId.slice(0, 8)}.csv`);
  }

  const filters: { key: ViewFilter; label: string; labelFr: string; n: number }[] = [
    { key: "all", label: "All", labelFr: "Tous", n: counts.all },
    { key: "queued", label: "Queued", labelFr: "En attente", n: counts.queued },
    { key: "running", label: "Running", labelFr: "En cours", n: counts.running },
    { key: "succeeded", label: "Succeeded", labelFr: "Réussis", n: counts.succeeded },
    { key: "failed", label: "Failed", labelFr: "Échoués", n: counts.failed },
  ];

  return (
    <section className="mb-4 border rounded-lg bg-card overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={status === "completed" ? "default" : "secondary"} className="font-mono">
            {status}
          </Badge>
          <span className="font-medium">{fr ? "Découverte" : "Discovery"}</span>
          <span className="text-muted-foreground text-xs">
            {processed}/{total} {fr ? "fournisseurs" : "funders"}
            {data
              ? ` · +${data.totalInserted} ${fr ? "nouvelles" : "new"} · ${data.totalSeenAgain} ${fr ? "revues" : "repeats"}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={exportJson}
            disabled={!data}
            title="Export JSON"
          >
            <FileJson className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportCsv}
            disabled={perFunder.length === 0}
            title="Export CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground ml-1"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="px-4 py-2">
        <Progress value={pct} className="h-1.5" />
      </div>
      {error && (
        <p className="px-4 py-2 text-xs text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {errorGroups.length > 0 && (
        <div className="px-4 py-2 border-y bg-destructive/5 space-y-1.5">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {fr ? "Erreurs regroupées" : "Errors grouped"} ({errorGroups.length})
          </p>
          {errorGroups.map(([cat, g]) => (
            <div key={cat} className="text-xs">
              <span className="font-mono uppercase text-destructive mr-2">{cat}</span>
              <span className="text-muted-foreground">
                {g.funders.length} · {g.hint}
              </span>
              <span className="text-muted-foreground ml-1">
                — {g.funders.map((f) => f.name).join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-muted/10 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setView(f.key)}
            className={`text-[11px] px-2 py-0.5 rounded ${view === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {fr ? f.labelFr : f.label} <span className="tabular-nums opacity-70">({f.n})</span>
          </button>
        ))}
      </div>

      <ul className="divide-y max-h-64 overflow-auto">
        {visible.length === 0 && (
          <li className="px-4 py-3 text-xs text-muted-foreground">
            {perFunder.length === 0
              ? fr
                ? "En attente du démarrage…"
                : "Waiting for job to start…"
              : fr
                ? "Aucun fournisseur dans cette vue."
                : "No funders match this view."}
          </li>
        )}
        {visible.map((f) => (
          <li key={f.funder_id} className="flex items-center gap-2 px-4 py-2 text-xs">
            <StatusIcon s={f.status} />
            <span className="font-medium truncate flex-1">{f.funder_name}</span>
            {f.attempts > 1 && (
              <Badge variant="outline" className="text-[10px] h-5">
                {fr ? "essai" : "attempt"} {f.attempts}
              </Badge>
            )}
            {f.engine && <span className="text-muted-foreground font-mono">[{f.engine}]</span>}
            <span className="text-muted-foreground tabular-nums">
              +{f.inserted}
              {f.seenAgain ? ` (${f.seenAgain} ${fr ? "revues" : "rep"})` : ""}
            </span>
            {f.latency_ms != null && (
              <span className="text-muted-foreground tabular-nums w-14 text-right">
                {f.latency_ms}ms
              </span>
            )}
            {f.status === "failed" && f.lastError && (
              <span className="text-destructive truncate max-w-[40%]" title={f.lastError}>
                ·{" "}
                {(() => {
                  const c = categorizeError(f.lastError);
                  return fr ? c.hintFr : c.hint;
                })()}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="px-4 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/10">
        {fr
          ? "Détails complets par réintento dans le Event Log ci-dessous."
          : "Full per-retry details in the Event Log below."}
      </p>
    </section>
  );
}
