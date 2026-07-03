// Per-grant audit page: shows the rule engine result, evidence used, agent
// trace timeline, and final verdict. Linked from /grants/$id "Audit" button.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { getGrantAudit } from "@/lib/grant-audit.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const auditQuery = (id: string) =>
  queryOptions({
    queryKey: ["grant-audit", id],
    queryFn: () => getGrantAudit({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/grants/$id/audit")({
  head: ({ params }) => ({ meta: [{ title: `Audit · Grant ${params.id.slice(0, 8)} — IIAL` }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(auditQuery(params.id)),
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: AuditPage,
});

const STATUS_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  fail: <XCircle className="h-4 w-4 text-destructive" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  skip: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

function AuditPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(auditQuery(id));
  const { grant, rules, evaluation, evidence, trace, verdict } = data;
  const g = grant as {
    id: string;
    title: string;
    status: string;
    fit_score: number | null;
    url?: string;
    funder: { name: string } | null;
  };

  const verdictBadge =
    verdict === "accepted" ? (
      <Badge className="bg-green-600">Accepted</Badge>
    ) : verdict === "rejected" ? (
      <Badge variant="destructive">Rejected</Badge>
    ) : (
      <Badge variant="secondary">Pending</Badge>
    );

  const blockingFail = rules.checks.find((c) => c.status === "fail" && c.hard);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link to="/grants/$id" params={{ id }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to grant
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold truncate flex-1">{g.title}</h1>
        {verdictBadge}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verdict</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div>
            <span className="text-muted-foreground">Why:</span>{" "}
            {blockingFail ? (
              <span>
                <b className="text-destructive">Hard-fail</b> on <i>{blockingFail.label}</i> —{" "}
                {blockingFail.detail}.
              </span>
            ) : evaluation && evaluation.fit_score != null ? (
              <span>
                Combined fit <b>{Math.round(evaluation.fit_score * 100)}</b> vs threshold{" "}
                <b>{rules.threshold_fit_pass}</b>. Rule score {Math.round(rules.rule_score)}, LLM
                weight {rules.weight_llm}.
              </span>
            ) : (
              <span>
                Not yet evaluated. Rule score so far: <b>{Math.round(rules.rule_score)}</b>.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              Funder: <b>{g.funder?.name ?? "—"}</b>
            </span>
            <span>
              · Status: <b>{g.status}</b>
            </span>
            <span>
              · Detected role: <b>{rules.detected_role}</b>
            </span>
            {rules.cost_share_pct != null && (
              <span>
                · Org cost-share: <b>{rules.cost_share_pct}%</b>
              </span>
            )}
            {rules.rolling_intake && <span>· Rolling intake</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules evaluated ({rules.checks.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {rules.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                {STATUS_ICON[c.status]}
                <div className="flex-1">
                  <div className="font-medium">
                    {c.label}{" "}
                    {c.hard && (
                      <Badge variant="outline" className="ml-1 text-xs">
                        hard
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
                <Badge
                  variant={
                    c.status === "fail"
                      ? "destructive"
                      : c.status === "pass"
                        ? "default"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {c.status}
                </Badge>
              </li>
            ))}
            {rules.checks.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">No rules triggered.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      {evaluation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">LLM rationale ({evaluation.model})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {evaluation.rationale_en}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence used ({evidence.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y max-h-96 overflow-y-auto">
            {evidence.map((e, i) => (
              <li key={i} className="px-4 py-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{e.agent}</Badge>
                  <span className="font-medium">{e.field}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {e.extraction_method}
                  </Badge>
                  <span className="text-muted-foreground">
                    conf {Math.round(Number(e.confidence) * 100)}%
                  </span>
                  <a
                    href={e.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    source <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-muted-foreground italic truncate" title={e.snippet}>
                  "{e.snippet}"
                </div>
              </li>
            ))}
            {evidence.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">No evidence captured yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent trace ({trace.length} steps)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y max-h-96 overflow-y-auto">
            {trace.map((s, i) => (
              <li
                key={i}
                className="px-4 py-2 text-xs grid grid-cols-[110px_90px_1fr_60px] gap-2 items-baseline"
              >
                <span className="text-muted-foreground">
                  {new Date(s.created_at).toLocaleTimeString()}
                </span>
                <Badge variant="outline" className="w-fit">
                  {s.agent}
                </Badge>
                <div>
                  <b>{s.step}</b>
                  {s.message ? <> — {s.message}</> : null}
                </div>
                <span className="text-muted-foreground text-right">{s.duration_ms ?? "—"}ms</span>
              </li>
            ))}
            {trace.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">No trace steps recorded.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
