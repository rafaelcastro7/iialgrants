import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { listGrants, discoverAllFunders, enrichGrant, autoEvaluatePending } from "@/lib/grants.functions";
import { runEvaluator } from "@/agents/evaluator.functions";
import { runStrategist } from "@/agents/strategist.functions";
import { useIsAdmin } from "@/lib/use-platform";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { FitEvaluation } from "@/components/grants/FitEvaluation";
import { GrantFilters, applyGrantFilters } from "@/components/grants/GrantFilters";
import { EventLog } from "@/components/grants/EventLog";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

const grantsQueryOptions = queryOptions({
  queryKey: ["grants", "all"],
  queryFn: () => listGrants({ data: { limit: 50 } }),
});

export const Route = createFileRoute("/_authenticated/grants")({
  head: () => ({
    meta: [
      { title: "Grants — IIAL" },
      { name: "description", content: "Browse Canadian funding opportunities discovered and enriched by IIAL agents." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(grantsQueryOptions),
  component: GrantsPage,
});


function GrantsPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language?.startsWith("fr");
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const fetchGrants = useServerFn(listGrants);
  const evaluate = useServerFn(runEvaluator);
  const strategize = useServerFn(runStrategist);
  const discoverAll = useServerFn(discoverAllFunders);
  const enrichOne = useServerFn(enrichGrant);
  const autoEvaluate = useServerFn(autoEvaluatePending);

  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());
  const [evalError, setEvalError] = useState<string | null>(null);
  const [discoveryMsg, setDiscoveryMsg] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<string>("all");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [onlyWithDeadline, setOnlyWithDeadline] = useState(false);
  const { data } = useSuspenseQuery({
    queryKey: ["grants", "all"],
    queryFn: () => fetchGrants({ data: { limit: 50 } }),
  });

  useEffect(() => { syncClientLocale(); }, []);

  // Auto-evaluate every enriched grant the user hasn't scored yet, on mount.
  // Mark them as evaluating so the pipeline stepper animates in real time.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const pendingIds = data.grants
      .filter((g) => !g.evaluation && ["discovered", "enriched", "scored", "shortlisted"].includes(g.status))
      .map((g) => g.id);
    if (pendingIds.length === 0) return;
    setEvaluatingIds(new Set(pendingIds));
    autoEvaluate({ data: { limit: 10 } })
      .then(async (r) => {
        if (r.evaluated > 0) {
          setAutoMsg(fr ? `${r.evaluated} subvention(s) évaluée(s) automatiquement.` : `${r.evaluated} grant(s) auto-evaluated.`);
        } else if ("reason" in r && r.reason === "org_profile_missing") {
          setAutoMsg(fr
            ? "Complétez votre profil d'organisation pour activer l'évaluation IA."
            : "Complete your organization profile to enable AI fit evaluation.");
        }
        await qc.invalidateQueries({ queryKey: ["grants"] });
      })
      .catch((e) => setEvalError(e instanceof Error ? e.message : String(e)))
      .finally(() => setEvaluatingIds(new Set()));
  }, [data.grants, autoEvaluate, fr, qc]);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }
  async function onEvaluate(grantId: string) {
    setPending(grantId); setEvalError(null);
    setEvaluatingIds((s) => new Set(s).add(grantId));
    try {
      await evaluate({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
      setEvaluatingIds((s) => { const n = new Set(s); n.delete(grantId); return n; });
    }
  }
  async function onDraft(grantId: string) {
    setPending(grantId + ":draft"); setEvalError(null);
    try {
      const r = await strategize({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
      await navigate({ to: "/proposals/$id", params: { id: r.proposalId } });
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally { setPending(null); }
  }
  async function onDiscoverAll() {
    setPending("__discover__"); setDiscoveryMsg(null); setEvalError(null);
    try {
      const r = await discoverAll({});
      if (!r || typeof r !== "object") {
        setDiscoveryMsg("Discovery returned no payload (check Event log for per-funder status).");
      } else {
        const perFunder = Array.isArray(r.perFunder) ? r.perFunder : [];
        const lines = [
          `Discovered ${r.totalInserted ?? 0} new grant(s), ${r.totalSeenAgain ?? 0} already known, ${r.evaluated ?? 0} auto-evaluated.`,
          ...perFunder.map((p) => `  · ${p.funder}: +${p.inserted ?? 0}${p.seenAgain ? ` (${p.seenAgain} repeat)` : ""}${p.engine ? ` [${p.engine}]` : ""}${p.error ? ` — error: ${p.error}` : ""}`),
        ];
        setDiscoveryMsg(lines.join("\n"));
      }

      await qc.invalidateQueries({ queryKey: ["grants"] });
      autoRan.current = false;
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally { setPending(null); }
  }
  async function onEnrich(grantId: string) {
    setPending(grantId + ":enrich"); setEvalError(null);
    try {
      await enrichOne({ data: { grantId } });
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally { setPending(null); }
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
            <Link to="/proposals" className="text-sm text-muted-foreground hover:underline">{t("nav.proposals")}</Link>
            <Link to="/org" className="text-sm text-muted-foreground hover:underline">{t("org.title")}</Link>

          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={signOut}>{t("nav.signOut")}</Button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("nav.grants")}</h1>
          {isAdmin && (
            <Button size="sm" onClick={onDiscoverAll} disabled={pending === "__discover__"}>
              {pending === "__discover__" ? t("app.loading") : "Discover & Enrich"}
            </Button>
          )}
        </div>
        {discoveryMsg && (
          <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{discoveryMsg}</pre>
          </div>
        )}
        {autoMsg && <p className="text-sm text-muted-foreground mb-3">{autoMsg}</p>}
        {evalError && (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 flex items-start justify-between gap-3">
            <p className="text-sm text-destructive break-words">{evalError}</p>
            <button type="button" onClick={() => setEvalError(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
          </div>
        )}

        <GrantFilters
          grants={data.grants}
          fr={fr}
          jurisdiction={jurisdiction} setJurisdiction={setJurisdiction}
          eligibleOnly={eligibleOnly} setEligibleOnly={setEligibleOnly}
          onlyWithDeadline={onlyWithDeadline} setOnlyWithDeadline={setOnlyWithDeadline}
        />
        {(() => {
          const filtered = applyGrantFilters(data.grants, { jurisdiction, eligibleOnly, onlyWithDeadline });
          return data.grants.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("grants.empty")}
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
            {fr ? "Aucune subvention ne correspond aux filtres." : "No grants match the current filters."}
          </CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((g) => {
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
                  <CardContent className="space-y-3">
                    {summary && <p className="text-sm text-muted-foreground line-clamp-3">{summary}</p>}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>{t("grants.amount")}: {fmt(g.amount_cad_min)} – {fmt(g.amount_cad_max)}</span>
                      <span>{t("grants.deadline")}: {g.deadline ?? "—"}</span>
                    </div>

                    <FitEvaluation
                      status={g.status}
                      discoveredAt={g.discovered_at}
                      enrichedAt={g.enriched_at}
                      scoredAt={g.scored_at}
                      evaluation={g.evaluation}
                      isEvaluating={evaluatingIds.has(g.id)}
                      fr={fr}
                    />

                    <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                      <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                        {t("grants.source")} →
                      </a>
                      <div className="flex gap-2 flex-wrap">
                        {isAdmin && g.status === "discovered" && (
                          <Button size="sm" variant="outline" disabled={pending === g.id + ":enrich"} onClick={() => onEnrich(g.id)}>
                            {pending === g.id + ":enrich" ? t("app.loading") : "Enrich"}
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" disabled={pending === g.id} onClick={() => onEvaluate(g.id)}>
                          {pending === g.id ? t("app.loading") : (g.evaluation ? (fr ? "Réévaluer" : "Re-evaluate") : t("grants.evaluate"))}
                        </Button>
                        {(g.status === "scored" || g.status === "shortlisted" || g.status === "in_proposal") && (
                          <Button size="sm" disabled={pending === g.id + ":draft"} onClick={() => onDraft(g.id)}>
                            {pending === g.id + ":draft" ? t("app.loading") : t("grants.draftProposal")}
                          </Button>
                        )}
                      </div>
                    </div>

                  </CardContent>
                </Card>
              );
            })}
            {evalError && <p className="text-sm text-destructive">{evalError}</p>}
          </div>
        );
        })()}
        {isAdmin && <EventLog fr={fr} />}
      </section>
    </main>
  );
}
