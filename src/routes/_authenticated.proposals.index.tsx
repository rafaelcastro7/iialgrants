import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listProposals, ingestOrgProfileAsKnowledge } from "@/lib/proposals.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { syncClientLocale } from "@/i18n/sync";
import { AppTopBar } from "@/components/AppSidebar";
import "@/i18n";

const proposalsQueryOptions = queryOptions({
  queryKey: ["proposals", "all"],
  queryFn: () => listProposals(),
});

export const Route = createFileRoute("/_authenticated/proposals/")({
  head: () => ({
    meta: [
      { title: "Proposals — IIAL" },
      {
        name: "description",
        content:
          "AI-drafted grant proposals with cited evidence from your organization knowledge base.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(proposalsQueryOptions),
  component: ProposalsPage,
});

function ProposalsPage() {
  const { t } = useTranslation();
  const fr = false; /* EN-only */
  const qc = useQueryClient();
  const fetchProposals = useServerFn(listProposals);
  const ingest = useServerFn(ingestOrgProfileAsKnowledge);
  const [ingesting, setIngesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { data } = useSuspenseQuery({
    queryKey: ["proposals", "all"],
    queryFn: () => fetchProposals(),
  });

  useEffect(() => {
    syncClientLocale();
  }, []);

  async function onIngest() {
    setIngesting(true);
    setMsg(null);
    try {
      const r = await ingest();
      setMsg(`+${r.inserted}`);
      await qc.invalidateQueries({ queryKey: ["proposals"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar title={t("proposals.title")} />

      <section className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("proposals.title")}</h1>
          <Button size="sm" variant="secondary" onClick={onIngest} disabled={ingesting}>
            {ingesting ? t("app.loading") : t("proposals.ingestKnowledge")}
          </Button>
        </div>
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

        {data.proposals.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("proposals.empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {data.proposals.map((p) => {
              const grant = Array.isArray(p.grant) ? p.grant[0] : p.grant;
              const grantTitle = grant
                ? fr && grant.title_fr
                  ? grant.title_fr
                  : grant.title
                : "—";
              return (
                <Card key={p.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      <Badge>{t(`proposals.status.${p.status}`)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("proposals.createdFrom")}: {grantTitle}
                      {grant?.deadline ? ` · ${grant.deadline}` : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground flex gap-4">
                      <span>
                        {t("proposals.version")} {p.version}
                      </span>
                      {p.critic_score != null && (
                        <span>
                          {t("proposals.score")}: {(Number(p.critic_score) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <Link to="/proposals/$id" params={{ id: p.id }}>
                      <Button size="sm">{t("proposals.open")} →</Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
