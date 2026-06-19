import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { listGrants } from "@/lib/grants.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

export const Route = createFileRoute("/_authenticated/grants")({
  head: () => ({
    meta: [
      { title: "Grants — IIAL" },
      { name: "description", content: "Browse Canadian funding opportunities discovered and enriched by IIAL agents." },
    ],
  }),
  component: GrantsPage,
});

const grantsQuery = () =>
  queryOptions({
    queryKey: ["grants", "all"],
    queryFn: () => listGrants({ data: { limit: 50 } }),
  });

function GrantsPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language?.startsWith("fr");
  const navigate = useNavigate();
  const fetchGrants = useServerFn(listGrants);
  const { data } = useSuspenseQuery({
    queryKey: ["grants", "all"],
    queryFn: () => fetchGrants({ data: { limit: 50 } }),
  });

  useEffect(() => { syncClientLocale(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  const fmt = (n: number | null) =>
    n == null ? "—" : new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="font-semibold">{t("app.name")}</Link>
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">{t("nav.dashboard")}</Link>
            <Link to="/grants" className="text-sm font-medium">{t("nav.grants")}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={signOut}>{t("nav.signOut")}</Button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("nav.grants")}</h1>
        {data.grants.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("grants.empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {data.grants.map((g) => {
              const funder = Array.isArray(g.funder) ? g.funder[0] : g.funder;
              const title = (fr && g.title_fr) ? g.title_fr : g.title;
              const summary = (fr && g.summary_fr) ? g.summary_fr : g.summary;
              return (
                <Card key={g.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="text-base">{title}</CardTitle>
                      <Badge variant={g.status === "shortlisted" ? "default" : "secondary"}>
                        {t(`grants.status.${g.status}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {funder ? (fr && funder.name_fr ? funder.name_fr : funder.name) : "—"}
                      {funder?.jurisdiction ? ` · ${funder.jurisdiction}` : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {summary && <p className="text-sm text-muted-foreground line-clamp-3">{summary}</p>}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>{t("grants.amount")}: {fmt(g.amount_cad_min)} – {fmt(g.amount_cad_max)}</span>
                      <span>{t("grants.deadline")}: {g.deadline ?? "—"}</span>
                      {g.fit_score != null && <span>{t("grants.fit")}: {(g.fit_score * 100).toFixed(0)}%</span>}
                    </div>
                    <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                      {t("grants.source")} →
                    </a>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

// Loader prefetch (uses TanStack Query default pattern).
Route.update({
  loader: ({ context }) => context.queryClient.ensureQueryData(grantsQuery()),
});
