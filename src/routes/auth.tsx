import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "@/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — IIAL" },
      { name: "description", content: "Sign in to IIAL grant intelligence platform." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const fn =
        mode === "signin"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/dashboard` },
            });
      const { error } = await fn;
      if (error) throw error;
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const DEMO_USERS = [
    { label: "Admin", email: "demo-admin@iial.test" },
    { label: "Member A", email: "demo-member-a@iial.test" },
    { label: "Member B", email: "demo-member-b@iial.test" },
  ] as const;
  const DEMO_PASSWORD = "IIAL-Demo-2026!";

  async function demoLogin(demoEmail: string) {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: DEMO_PASSWORD,
      });
      if (error) throw error;
      await navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }




  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{mode === "signin" ? t("auth.signIn") : t("auth.signUp")}</CardTitle>
          <LanguageSwitcher />
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("app.loading") : mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
            </Button>
            <button type="button" className="text-sm underline w-full text-center" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? t("auth.signUp") : t("auth.signIn")}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 text-center">
              Demo autologin
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_USERS.map((u) => (
                <Button
                  key={u.email}
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loading}
                  onClick={() => demoLogin(u.email)}
                >
                  {u.label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              Seeded accounts · password <code className="font-mono">{DEMO_PASSWORD}</code>
            </p>
          </div>

        </CardContent>

      </Card>
    </div>
  );
}
