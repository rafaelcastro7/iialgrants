import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import { useIsAdmin, useModuleFlags } from "@/lib/use-platform";
import { Shield } from "lucide-react";
import "@/i18n";

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

  useEffect(() => {
    syncClientLocale();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">{t("nav.dashboard")}</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link to="/admin">
              <Button variant="outline" size="sm" className="gap-1">
                <Shield className="h-4 w-4" /> Console
              </Button>
            </Link>
          )}
          <LanguageSwitcher />
          <Button variant="outline" size="sm" onClick={signOut}>{t("nav.signOut")}</Button>
        </div>
      </header>
      <Card>
        <CardHeader><CardTitle>{t("app.name")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{email ?? "—"}</p>
          <p className="mt-4 text-sm">{t("app.tagline")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {on("grants") && <Link to="/grants"><Button>{t("nav.grants")} →</Button></Link>}
            {on("proposals") && <Link to="/proposals"><Button variant="outline">{t("nav.proposals")}</Button></Link>}
            {on("submissions") && <Link to="/submissions"><Button variant="outline">{t("nav.submissions")}</Button></Link>}
            {isAdmin && on("analytics") && <Link to="/ops"><Button variant="ghost">{t("ops.title")}</Button></Link>}
            {on("privacy") && <Link to="/privacy"><Button variant="ghost">{t("privacy.link")}</Button></Link>}
            {on("compliance") && <Link to="/compliance"><Button variant="ghost">{t("compliance.link")}</Button></Link>}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
