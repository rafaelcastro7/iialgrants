import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { generateOpportunityBrief, type Brief } from "@/lib/opportunity-brief.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, CheckCircle2, XCircle, AlertTriangle, MinusCircle } from "lucide-react";

function StatusIcon({ s }: { s: string }) {
  if (s === "pass") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
  if (s === "fail") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function VerdictBadge({ v }: { v: Brief["recommendation"]["verdict"] }) {
  if (v === "go") return <Badge className="bg-green-600 hover:bg-green-700">GO</Badge>;
  if (v === "no_go") return <Badge variant="destructive">NO-GO</Badge>;
  return <Badge className="bg-amber-600 hover:bg-amber-700">GO-CONDITIONAL</Badge>;
}

export function OpportunityBriefPanel({ grantId }: { grantId: string }) {
  const gen = useServerFn(generateOpportunityBrief);
  const m = useMutation({ mutationFn: () => gen({ data: { grantId } }) });
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); m.mutate(); }}
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        Opportunity Brief (SOP)
      </Button>
    );
  }

  const b = m.data?.brief;

  return (
    <Card className="mt-4 border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Opportunity Brief — IIAL SOP v2
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Stage 3 del SOP de Grant Finding · síntesis estructurada para go/no-go de liderazgo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>↻ Regenerar</Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {m.isPending && <p className="text-muted-foreground">Generando brief…</p>}
        {m.isError && <p className="text-destructive text-xs">{(m.error as Error).message}</p>}
        {b && (
          <>
            {/* Recommendation header */}
            <div className="rounded-lg border-2 border-dashed p-3 flex items-start gap-3">
              <VerdictBadge v={b.recommendation.verdict} />
              <div className="flex-1 space-y-1">
                <p className="text-xs"><strong>Razón:</strong> {b.recommendation.reason}</p>
                {b.recommendation.conditions.length > 0 && (
                  <>
                    <p className="text-xs font-medium mt-2">Condiciones:</p>
                    <ul className="text-xs list-disc pl-4 space-y-0.5 text-muted-foreground">
                      {b.recommendation.conditions.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {/* Program Snapshot */}
            <section>
              <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Program Snapshot</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><dt className="text-muted-foreground inline">Funder: </dt><dd className="inline">{b.program_snapshot.funder ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground inline">Program: </dt><dd className="inline">{b.program_snapshot.program}</dd></div>
                <div><dt className="text-muted-foreground inline">Max amount: </dt><dd className="inline">{b.program_snapshot.max_amount_cad ? `$${b.program_snapshot.max_amount_cad.toLocaleString()} CAD` : "—"}</dd></div>
                <div><dt className="text-muted-foreground inline">Cost-share org: </dt><dd className="inline">{b.program_snapshot.cost_share_pct_org !== null ? `~${b.program_snapshot.cost_share_pct_org}%` : "—"}</dd></div>
                <div><dt className="text-muted-foreground inline">Intake: </dt><dd className="inline capitalize">{b.program_snapshot.intake}</dd></div>
                <div><dt className="text-muted-foreground inline">Deadline: </dt><dd className="inline">{b.program_snapshot.deadline ?? "—"}</dd></div>
              </dl>
              {b.program_snapshot.url && (
                <a href={b.program_snapshot.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">↗ Authoritative URL</a>
              )}
            </section>

            <Separator />

            {/* IIAL Role */}
            <section className="flex items-center gap-2">
              <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">IIAL Role:</span>
              <Badge variant={b.iial_role === "unknown" ? "secondary" : "default"} className="capitalize">{b.iial_role}</Badge>
            </section>

            {/* Strategic Angle */}
            <section>
              <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Strategic Angle</h4>
              <p className="text-xs leading-relaxed">{b.strategic_angle}</p>
            </section>

            {/* Mandatory Components */}
            <section>
              <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Mandatory Components</h4>
              {b.mandatory_components.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">— ninguno detectado —</p>
              ) : (
                <ul className="text-xs list-disc pl-4 space-y-0.5">
                  {b.mandatory_components.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              )}
            </section>

            {/* Money */}
            <section>
              <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Money</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><dt className="text-muted-foreground inline">Request: </dt><dd className="inline">{b.money.request_amount ? `$${b.money.request_amount.toLocaleString()}` : "—"}</dd></div>
                <div><dt className="text-muted-foreground inline">Match required: </dt><dd className="inline">{b.money.match_required_pct !== null ? `~${b.money.match_required_pct}%` : "—"}</dd></div>
                <div><dt className="text-muted-foreground inline">In-kind cap: </dt><dd className="inline">manual</dd></div>
                <div><dt className="text-muted-foreground inline">Cash match verified: </dt><dd className="inline">{b.money.cash_match_verified ? "✓" : "pendiente"}</dd></div>
              </dl>
            </section>

            {/* Risks */}
            <section>
              <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Risks & Unknowns</h4>
              {b.risks.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">— ninguno detectado —</p>
              ) : (
                <ul className="text-xs list-disc pl-4 space-y-0.5">
                  {b.risks.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              )}
            </section>

            <Separator />

            {/* SOP Filters detail */}
            <section>
              <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Filtros del SOP</h4>
              <ul className="space-y-1 text-xs">
                {b.filters.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <StatusIcon s={c.status} />
                    <span className="flex-1">
                      <span className="font-medium">{c.label}</span>
                      {c.hard && <span className="ml-1 text-[10px] uppercase text-destructive">hard</span>}
                      <span className="block text-muted-foreground">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
