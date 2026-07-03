import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "@/i18n";
import { syncClientLocale } from "@/i18n/sync";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IIAL — AI Grant Intelligence" },
      {
        name: "description",
        content: "Discover, evaluate, and win Canadian grants with AI agents. Bilingual EN/FR..",
      },
      { property: "og:title", content: "IIAL — AI Grant Intelligence" },
      {
        property: "og:description",
        content: "Discover, evaluate, and win Canadian grants with AI agents.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useTranslation();
  useEffect(() => {
    syncClientLocale();
  }, []);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between p-4 border-b">
        <span className="font-semibold">{t("app.name")}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link to="/auth">
            <Button size="sm">{t("auth.signIn")}</Button>
          </Link>
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-4 py-20 text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{t("home.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("home.subtitle")}</p>
        <Link to="/auth">
          <Button size="lg">{t("home.cta")}</Button>
        </Link>
      </section>
    </main>
  );
}
