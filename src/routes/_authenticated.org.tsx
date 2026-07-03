import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { getOrgProfile, saveOrgProfile } from "@/lib/org.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

const orgQueryOptions = queryOptions({
  queryKey: ["org", "self"],
  queryFn: () => getOrgProfile(),
});

export const Route = createFileRoute("/_authenticated/org")({
  head: () => ({ meta: [{ title: "Organization — IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(orgQueryOptions),
  component: OrgPage,
});

const STAGES = ["startup", "sme", "nonprofit", "research", "public_sector"] as const;

type OrgInput = {
  org_name: string;
  sectors: string[];
  jurisdictions: string[];
  stage: (typeof STAGES)[number];
  annual_budget_cad: number | null;
  focus_areas: string | null;
};

function OrgPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(orgQueryOptions);
  const save = useServerFn(saveOrgProfile);
  const mut = useMutation({
    mutationFn: (input: OrgInput) => save({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });
  useEffect(() => {
    syncClientLocale();
  }, []);

  const p = data.profile;
  const [orgName, setOrgName] = useState(p?.org_name ?? "");
  const [sectors, setSectors] = useState((p?.sectors ?? []).join(", "));
  const [jurisdictions, setJurisdictions] = useState((p?.jurisdictions ?? ["CA"]).join(", "));
  const [stage, setStage] = useState<(typeof STAGES)[number]>(
    (p?.stage as (typeof STAGES)[number]) ?? "sme",
  );
  const [budget, setBudget] = useState<string>(p?.annual_budget_cad?.toString() ?? "");
  const [focus, setFocus] = useState(p?.focus_areas ?? "");

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <header className="flex items-center justify-between mb-6 max-w-2xl mx-auto">
        <nav className="flex gap-4 text-sm">
          <Link to="/dashboard">{t("nav.dashboard")}</Link>
          <Link to="/grants">{t("nav.grants")}</Link>
          <span className="font-semibold">{t("org.title")}</span>
        </nav>
        <LanguageSwitcher />
      </header>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>{t("org.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate({
                org_name: orgName,
                sectors: sectors
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                jurisdictions: jurisdictions
                  .split(",")
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean),
                stage,
                annual_budget_cad: budget ? Number(budget) : null,
                focus_areas: focus || null,
              });
            }}
          >
            <div className="space-y-2">
              <Label>{t("org.name")}</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t("org.sectors")}</Label>
              <Input
                value={sectors}
                onChange={(e) => setSectors(e.target.value)}
                placeholder="tech, retail"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("org.jurisdictions")}</Label>
              <Input
                value={jurisdictions}
                onChange={(e) => setJurisdictions(e.target.value)}
                placeholder="CA, ON"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("org.stage")}</Label>
              <select
                className="w-full border rounded h-10 px-3 bg-background"
                value={stage}
                onChange={(e) => setStage(e.target.value as (typeof STAGES)[number])}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`org.stages.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("org.budget")}</Label>
              <Input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("org.focus")}</Label>
              <Textarea rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} />
            </div>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? t("app.loading") : t("org.save")}
            </Button>
            {mut.isSuccess && <p className="text-sm text-green-600">{t("org.saved")}</p>}
            {mut.isError && (
              <p className="text-sm text-destructive">{(mut.error as Error).message}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
