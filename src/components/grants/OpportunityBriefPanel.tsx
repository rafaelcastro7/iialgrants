import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { generateOpportunityBrief, type Brief } from "@/lib/opportunity-brief.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
        onClick={() => {
          setOpen(true);
          m.mutate();
        }}
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        Opportunity Brief
      </Button>
    );
  }

  const b = m.data?.brief;

  return (
    <Card className="mt-4 border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Opportunity Brief - IIAL SOP v2
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Structured leadership brief for the go / no-go decision.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {m.isPending && <p className="text-muted-foreground">Generating brief...</p>}
        {m.isError && <p className="text-xs text-destructive">{(m.error as Error).message}</p>}
        {b && (
          <>
            <div className="flex items-start gap-3 rounded-lg border-2 border-dashed p-3">
              <VerdictBadge v={b.recommendation.verdict} />
              <div className="flex-1 space-y-1">
                <p className="text-xs">
                  <strong>Reason:</strong> {b.recommendation.reason}
                </p>
                {b.recommendation.conditions.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-medium">Conditions</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {b.recommendation.conditions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Program snapshot
              </h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <dt className="inline text-muted-foreground">Funder: </dt>
                  <dd className="inline">{b.program_snapshot.funder ?? "-"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Program: </dt>
                  <dd className="inline">{b.program_snapshot.program}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Max amount: </dt>
                  <dd className="inline">
                    {b.program_snapshot.max_amount_cad
                      ? `$${b.program_snapshot.max_amount_cad.toLocaleString()} CAD`
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Organization cost share: </dt>
                  <dd className="inline">
                    {b.program_snapshot.cost_share_pct_org !== null
                      ? `~${b.program_snapshot.cost_share_pct_org}%`
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Intake: </dt>
                  <dd className="inline capitalize">{b.program_snapshot.intake}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Deadline: </dt>
                  <dd className="inline">{b.program_snapshot.deadline ?? "-"}</dd>
                </div>
              </dl>
              {b.program_snapshot.url && (
                <a
                  href={b.program_snapshot.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                >
                  Authoritative URL
                </a>
              )}
            </section>

            <Separator />

            <section className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                IIAL role
              </span>
              <Badge
                variant={b.iial_role === "unknown" ? "secondary" : "default"}
                className="capitalize"
              >
                {b.iial_role}
              </Badge>
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Strategic angle
              </h4>
              <p className="text-xs leading-relaxed">{b.strategic_angle}</p>
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mandatory components
              </h4>
              {b.mandatory_components.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">No mandatory components detected.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {b.mandatory_components.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Funding structure
              </h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <dt className="inline text-muted-foreground">Request amount: </dt>
                  <dd className="inline">
                    {b.money.request_amount ? `$${b.money.request_amount.toLocaleString()}` : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Match required: </dt>
                  <dd className="inline">
                    {b.money.match_required_pct !== null ? `~${b.money.match_required_pct}%` : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">In-kind cap: </dt>
                  <dd className="inline">Manual review</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Cash match verified: </dt>
                  <dd className="inline">{b.money.cash_match_verified ? "Yes" : "Pending"}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Risks and unknowns
              </h4>
              {b.risks.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">No material risks detected.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {b.risks.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                SOP filters
              </h4>
              <ul className="space-y-1 text-xs">
                {b.filters.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <StatusIcon s={c.status} />
                    <span className="flex-1">
                      <span className="font-medium">{c.label}</span>
                      {c.hard && (
                        <span className="ml-1 text-[10px] uppercase text-destructive">hard</span>
                      )}
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
