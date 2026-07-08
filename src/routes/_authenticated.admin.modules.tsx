import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listModuleFlags, toggleModuleFlag } from "@/lib/admin-modules.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/PageLayout";

const qo = queryOptions({ queryKey: ["admin", "modules"], queryFn: () => listModuleFlags() });

export const Route = createFileRoute("/_authenticated/admin/modules")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => (
    <p className="text-sm text-destructive">Failed: {error.message}</p>
  ),
  component: ModulesPage,
});

function ModulesPage() {
  const { i18n } = useTranslation();
  const fr = false; /* EN-only */
  const qc = useQueryClient();
  const fetchMods = useServerFn(listModuleFlags);
  const toggle = useServerFn(toggleModuleFlag);
  const { data } = useSuspenseQuery({ queryKey: ["admin", "modules"], queryFn: () => fetchMods() });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(name: string, enabled: boolean) {
    setBusy(name);
    setError(null);
    try {
      await toggle({ data: { module: name, enabled } });
      await qc.invalidateQueries({ queryKey: ["admin", "modules"] });
      await qc.invalidateQueries({ queryKey: ["module-flags"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Admin"
        title="Modules"
        description="Enable or disable product modules across the workspace. Disabled modules hide from navigation and block their server functions."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.modules.map((m) => (
          <Card key={m.module}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-mono">{m.module}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {fr && m.description_fr ? m.description_fr : m.description}
                  </p>
                </div>
                <Switch
                  checked={m.enabled}
                  disabled={busy === m.module}
                  onCheckedChange={(v) => onToggle(m.module, v)}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between text-xs">
                <Badge variant={m.enabled ? "default" : "secondary"}>
                  {m.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <span className="text-muted-foreground">
                  updated {new Date(m.updated_at).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </PageContainer>
  );
}
