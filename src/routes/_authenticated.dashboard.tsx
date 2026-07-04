import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getOrgProfile } from "@/lib/org.functions";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import { useIsAdmin, useModuleFlags } from "@/lib/use-platform";
import {
  Activity,
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — IIAL" },
      { name: "description", content: "Your IIAL grant intelligence dashboard." },
    ],
  }),
  component: Dashboard,
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
  // against who this organization actually is (see deriveRulesFromOrg).
  const p = org?.profile;
  const profileComplete = !!(p?.org_name && p.sectors?.length && p.jurisdictions?.length);

  useEffect(() => {
    syncClientLocale();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  const tiles: NavTile[] = [
    {
      to: "/grants",
      label: `${t("nav.grants")} →`,
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
    <main className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold">{t("nav.dashboard")}</h1>
          <div className="flex items-center gap-2">
            <NotificationBell />
            {isAdmin && (
              <Link to="/admin">
                <Button variant="outline" size="sm" className="gap-1">
                  <Shield className="h-4 w-4" /> Console
                </Button>
              </Link>
            )}
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={signOut}>
              {t("nav.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">{email ?? "—"}</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-primary">
            {t("app.name")}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("app.tagline")}</p>
        </div>

        {org && !profileComplete && (
          <Card className="border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20">
            <CardContent className="flex flex-wrap items-center gap-3 py-4">
              <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Complete your organization profile</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Takes 2 minutes and powers real fit scoring — grants are compared against your
                  actual sectors, jurisdictions, and budget instead of generic defaults.
                </p>
              </div>
              <Link to="/org">
                <Button size="sm">Complete profile →</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.to} to={tile.to} className="block">
                <Card
                  className={`h-full transition-shadow hover:shadow-md ${
                    tile.primary ? "border-primary/30 bg-primary/[0.03]" : ""
                  }`}
                >
                  <CardContent className="flex items-start gap-3 py-4">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                        tile.primary
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{tile.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
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
    </main>
  );
}
