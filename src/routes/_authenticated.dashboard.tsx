import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getOrgProfile } from "@/lib/org.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { syncClientLocale } from "@/i18n/sync";
import { useIsAdmin, useModuleFlags } from "@/lib/use-platform";
import { AppTopBar } from "@/components/AppSidebar";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PageTransition } from "@/components/PageTransition";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  Building2,
  FileText,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
} from "lucide-react";
import "@/i18n";

type NavTile = {
  to: string;
  labelKey?: string;
  label?: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  moduleKey?: string;
  adminOnly?: boolean;
  primary?: boolean;
};

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <AppTopBar />
      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <Skeleton className="h-[400px] rounded-xl" />
          <div className="space-y-6">
            <Skeleton className="h-[300px] rounded-xl" />
            <Skeleton className="h-[200px] rounded-xl" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard - IIAL" },
      { name: "description", content: "Your IIAL grant intelligence dashboard." },
    ],
  }),
  component: Dashboard,
  pendingComponent: DashboardSkeleton,
});

function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const isAdmin = useIsAdmin();
  const { data: mods } = useModuleFlags();
  const on = (m: string) => mods?.isEnabled(m) ?? true;
  const fetchOrg = useServerFn(getOrgProfile);
  const { data: org } = useQuery({ queryKey: ["org", "self"], queryFn: () => fetchOrg() });

  // The single highest-value onboarding step: an incomplete org profile means
  // every grant score falls back to generic defaults instead of comparing
  // against who this organization actually is.
  const p = org?.profile;
  const profileComplete = !!(p?.org_name && p.sectors?.length && p.jurisdictions?.length);
  const moduleList = mods?.list ?? [];
  const enabledModules = moduleList.filter((m) => m.enabled);
  const moduleSummary =
    moduleList.length > 0
      ? `${enabledModules.length}/${moduleList.length} modules enabled`
      : "Loading module flags";
  const nextStep = profileComplete
    ? {
        title: "You are ready to search",
        body: "Browse grants to surface matched opportunities, then move the strongest fits into proposals and submissions.",
        ctaLabel: "Browse grants",
        to: "/grants" as const,
      }
    : {
        title: "Complete your organization profile",
        body: "Sectors and jurisdictions power deterministic fit scoring, so the system can stop guessing and start ranking accurately.",
        ctaLabel: "Finish profile",
        to: "/org" as const,
      };

  useEffect(() => {
    syncClientLocale();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const tiles: NavTile[] = [
    {
      to: "/grants",
      label: t("nav.grants"),
      icon: Search,
      description: "Browse matched opportunities and track your pipeline.",
      moduleKey: "grants",
      primary: true,
    },
    {
      to: "/proposals",
      label: t("nav.proposals"),
      icon: FileText,
      description: "Draft, review, and manage proposal sections.",
      moduleKey: "proposals",
    },
    {
      to: "/submissions",
      label: t("nav.submissions"),
      icon: Send,
      description: "Track what has been sent to funders.",
      moduleKey: "submissions",
    },
    {
      to: "/org",
      label: "Organization",
      icon: Building2,
      description: "Sectors, jurisdictions, and budget used for fit scoring.",
    },
    {
      to: "/fit-rules",
      label: "Fit Rules",
      icon: Sliders,
      description: "Tune how grants are screened for your organization.",
    },
    {
      to: "/ops",
      label: t("ops.title"),
      icon: Activity,
      description: "Pipeline analytics and agent operations.",
      moduleKey: "analytics",
      adminOnly: true,
    },
    {
      to: "/privacy",
      label: t("privacy.link"),
      icon: ShieldCheck,
      description: "Data access, export, and deletion requests.",
      moduleKey: "privacy",
    },
    {
      to: "/compliance",
      label: t("compliance.link"),
      icon: Shield,
      description: "Regulatory posture and audit readiness.",
      moduleKey: "compliance",
    },
  ].filter((tile) => (tile.moduleKey ? on(tile.moduleKey) : true) && (!tile.adminOnly || isAdmin));

  return (
    <PageTransition>
      <div className="relative min-h-screen overflow-hidden text-foreground">
        <AppTopBar title={t("nav.dashboard")} />

        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[-10rem] top-[-8rem] h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute right-[-12rem] top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <section className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:py-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
            <Card className="relative overflow-hidden border-border/70 bg-card/90 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.35)] backdrop-blur">
              <CardContent className="relative p-6 md:p-10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-brand/10" />
                <div className="relative">
                  <Badge
                    variant="secondary"
                    className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
                  >
                    AI-native grant intelligence
                  </Badge>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {email ?? "No email synced yet"}
                  </p>
                  <h2 className="mt-2 max-w-3xl font-display text-4xl leading-[0.95] tracking-tight md:text-6xl">
                    {t("app.name")}
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                    {t("app.tagline")}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button asChild size="lg" className="gap-2">
                      <Link to="/grants">
                        Browse grants
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link to="/proposals">Open proposals</Link>
                    </Button>
                  </div>

                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <MiniStat
                      icon={profileComplete ? BadgeCheck : AlertCircle}
                      label="Profile"
                      value={profileComplete ? "Ready" : "Needs setup"}
                      detail={
                        profileComplete
                          ? "Sectors and jurisdictions are locked in."
                          : "Add org data to unlock exact fit scoring."
                      }
                      tone={profileComplete ? "good" : "warn"}
                    />
                    <MiniStat
                      icon={BarChart3}
                      label="Modules"
                      value={moduleSummary}
                      detail={
                        enabledModules.length > 0
                          ? enabledModules
                              .slice(0, 3)
                              .map((m) => m.module)
                              .join(" / ")
                          : "No feature flags loaded yet"
                      }
                      tone="neutral"
                    />
                    <MiniStat
                      icon={isAdmin ? ShieldCheck : Shield}
                      label="Access"
                      value={isAdmin ? "Admin console" : "Standard access"}
                      detail={
                        isAdmin
                          ? "You can inspect operations and agents."
                          : "Your workspace is scoped to day-to-day grant work."
                      }
                      tone={isAdmin ? "good" : "neutral"}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-border/70 bg-card/90 shadow-sm backdrop-blur">
                <CardHeader className="space-y-2">
                  <CardTitle className="font-display text-2xl">Next best step</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    We turn the interface into a decision surface, not a pile of links.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Recommended now
                    </p>
                    <p className="mt-2 text-lg font-semibold">{nextStep.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{nextStep.body}</p>
                    <div className="mt-4">
                      <Button asChild className="w-full gap-2" size="lg">
                        <Link to={nextStep.to}>
                          {nextStep.ctaLabel}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {profileComplete ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        Organization context is complete.
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Fit scores, proposal angles, and validation rules can now work from your
                        actual profile instead of placeholders.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        One setup gap is still blocking better scoring.
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Add sectors and jurisdictions first. That is the smallest change with the
                        biggest UX payoff.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Enabled surfaces
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {enabledModules.slice(0, 6).map((m) => (
                        <Badge key={m.module} variant="outline" className="rounded-full px-3 py-1">
                          {m.module}
                        </Badge>
                      ))}
                      {enabledModules.length === 0 && (
                        <p className="text-sm text-muted-foreground">No module flags found yet.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ActivityFeed />
            </div>
          </div>

          {org && !profileComplete && (
            <Card className="border-amber-500/25 bg-amber-500/10 shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-3 p-4 md:p-5">
                <Sparkles className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Complete your organization profile</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Two minutes of setup unlocks deterministic fit scoring and better proposal
                    guidance.
                  </p>
                </div>
                <Link to="/org">
                  <Button size="sm" className="gap-2">
                    Complete profile
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <Link key={tile.to} to={tile.to} className="group block h-full">
                  <Card
                    className={`relative h-full overflow-hidden border-border/70 bg-card/85 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                      tile.primary
                        ? "border-primary/25 bg-gradient-to-br from-primary/[0.08] to-card"
                        : ""
                    }`}
                  >
                    <CardContent className="flex h-full items-start gap-3 p-5">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                          tile.primary
                            ? "border-primary/20 bg-primary text-primary-foreground shadow-sm"
                            : "border-border/70 bg-muted text-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-display text-xl leading-none">{tile.label}</p>
                          <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {tile.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border/70 bg-muted/30 text-foreground";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-base font-semibold">{value}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}
