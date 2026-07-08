// PUBLIC shareable fit report — read-only, no login required (Grantable-style).
// The unguessable token in the URL is the credential; data is fetched server-side
// after validating token + expiry + revocation.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import { getSharedReport, type SharedReport } from "@/lib/share-report.functions";
import type { AxisScore } from "@/agents/fit-rules.shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/report/$token")({
  head: () => ({ meta: [{ title: "Grant Fit Report — IIAL" }] }),
  component: SharedReportPage,
});

function SharedReportPage() {
  const { token } = Route.useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared-report", token],
    queryFn: () => getSharedReport({ data: { token } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-20">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
        </p>
      </Shell>
    );
  }
  if (isError || !data) {
    return (
      <Shell>
        <Card className="max-w-lg mx-auto mt-16">
          <CardContent className="py-8 text-center space-y-2">
            <p className="font-semibold">This report link is invalid or has expired.</p>
            <p className="text-sm text-muted-foreground">
              Ask the person who shared it to generate a new link.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return <ReportBody report={data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-lg tracking-tight text-primary">
            IIAL · Grant Fit Report
          </span>
          <Badge variant="outline" className="text-[10px]">
            Shared read-only view
          </Badge>
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-6 py-8">{children}</section>
    </main>
  );
}

function ReportBody({ report }: { report: SharedReport }) {
  const { grant, evaluation, evidence } = report;
  const fitPct = evaluation ? Math.round(evaluation.fit_score * 100) : null;
  const axes = evaluation?.axis_breakdown ?? null;
  const fmt = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-CA")}`);

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-foreground">{grant.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {grant.funder?.name ?? "Unknown funder"}
            {grant.funder?.jurisdiction ? ` · ${grant.funder.jurisdiction}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Fact label="Fit score" value={fitPct != null ? `${fitPct}/100` : "Not scored"} />
          <Fact
            label="Eligible"
            value={evaluation ? (evaluation.eligibility_pass ? "Yes" : "No") : "—"}
          />
          <Fact
            label="Amount"
            value={`${fmt(grant.amount_cad_min)} – ${fmt(grant.amount_cad_max)}`}
          />
          <Fact label="Deadline" value={grant.deadline ?? "Rolling / unknown"} />
        </div>

        {axes && axes.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fit by dimension</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {axes.map((a) => (
                  <ReportAxisBar key={a.axis} axis={a} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {evaluation?.rationale_en && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assessment rationale</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">
              {evaluation.rationale_en}
            </CardContent>
          </Card>
        )}

        {evidence.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Cited evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {evidence.map((e, i) => (
                  <li key={i} className="py-2 text-xs space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{e.field}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {e.extraction_method}
                      </Badge>
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
                      <p className="text-muted-foreground italic truncate" title={e.snippet}>
                        "{e.snippet}"
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Generated by IIAL Grants · deterministic screening with cited evidence ·{" "}
          <a href={grant.url} target="_blank" rel="noreferrer" className="underline">
            official grant page
          </a>
        </p>
      </div>
    </Shell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function ReportAxisBar({ axis }: { axis: AxisScore }) {
  const pct = axis.score == null ? 0 : axis.score * 10;
  const color =
    axis.status === "pass"
      ? "bg-emerald-500"
      : axis.status === "partial"
        ? "bg-amber-500"
        : axis.status === "fail"
          ? "bg-rose-500"
          : "bg-slate-300";
  return (
    <li className="text-xs" title={axis.reasons.join(" · ")}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-medium">{axis.label}</span>
        <span className="tabular-nums text-muted-foreground">
          {axis.score == null ? "N/A" : `${axis.score}/10`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {axis.reasons[0] && <p className="text-muted-foreground mt-0.5">{axis.reasons[0]}</p>}
    </li>
  );
}
