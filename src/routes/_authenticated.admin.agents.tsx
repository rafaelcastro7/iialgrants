import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAgentFlags, toggleAgentFlag } from "@/lib/admin-agents.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const qo = queryOptions({ queryKey: ["admin", "agents"], queryFn: () => listAgentFlags() });

export const Route = createFileRoute("/_authenticated/admin/agents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => <p className="text-sm text-destructive">Failed: {error.message}</p>,
  component: AgentsPage,
});

function AgentsPage() {
  const { i18n } = useTranslation();
  const fr = i18n.language?.startsWith("fr");
  const qc = useQueryClient();
  const fetchAgents = useServerFn(listAgentFlags);
  const toggle = useServerFn(toggleAgentFlag);
  const { data } = useSuspenseQuery({ queryKey: ["admin", "agents"], queryFn: () => fetchAgents() });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(name: string, enabled: boolean) {
    setBusy(name); setError(null);
    try {
      await toggle({ data: { agent: name, enabled } });
      await qc.invalidateQueries({ queryKey: ["admin", "agents"] });
      await qc.invalidateQueries({ queryKey: ["agent-flags"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <p className="text-sm text-muted-foreground">
          Enable or disable the 6 LLM agents (Discoverer, Enricher, Evaluator, Strategist, Writer, Critic). Disabled agents block their server functions.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.agents.map((a) => (
          <Card key={a.agent}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-mono capitalize">{a.agent}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {fr && a.description_fr ? a.description_fr : a.description}
                  </p>
                </div>
                <Switch
                  checked={a.enabled}
                  disabled={busy === a.agent}
                  onCheckedChange={(v) => onToggle(a.agent, v)}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between text-xs">
                <Badge variant={a.enabled ? "default" : "secondary"}>
                  {a.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <span className="text-muted-foreground">
                  updated {new Date(a.updated_at).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
