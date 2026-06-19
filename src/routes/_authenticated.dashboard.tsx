import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
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
          <LanguageSwitcher />
          <Button variant="outline" size="sm" onClick={signOut}>{t("nav.signOut")}</Button>
        </div>
      </header>
      <Card>
        <CardHeader><CardTitle>{t("app.name")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{email ?? "—"}</p>
          <p className="mt-4 text-sm">{t("app.tagline")}</p>
          <Link to="/grants" className="inline-block mt-4">
            <Button>{t("nav.grants")} →</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
