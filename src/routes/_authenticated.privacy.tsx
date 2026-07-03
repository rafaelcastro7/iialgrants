import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import {
  recordConsent,
  listMyConsents,
  createDsarRequest,
  listMyDsarRequests,
  exportMyData,
  requestAccountDeletion,
} from "@/lib/compliance.functions";
import "@/i18n";

export const Route = createFileRoute("/_authenticated/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Center — IIAL" },
      { name: "description", content: "Manage your consents, export your data, request deletion." },
    ],
  }),
  component: PrivacyCenter,
});

type Consent = {
  id: string;
  consent_type: string;
  action: string;
  policy_version: string;
  created_at: string;
};
type Dsar = {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type ConsentType =
  | "terms_of_service"
  | "privacy_policy"
  | "ai_processing"
  | "cross_border_transfer"
  | "marketing";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function PrivacyCenter() {
  const { t, i18n } = useTranslation();
  const lang: "en" | "fr" = "en"; // EN-only for now

  const [consents, setConsents] = useState<Consent[]>([]);
  const [dsars, setDsars] = useState<Dsar[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fnRecord = useServerFn(recordConsent);
  const fnList = useServerFn(listMyConsents);
  const fnDsar = useServerFn(createDsarRequest);
  const fnDsarList = useServerFn(listMyDsarRequests);
  const fnExport = useServerFn(exportMyData);
  const fnDelete = useServerFn(requestAccountDeletion);

  const refresh = useCallback(async () => {
    const [c, d] = await Promise.all([fnList({}), fnDsarList({})]);
    setConsents(c as Consent[]);
    setDsars(d as Dsar[]);
  }, [fnList, fnDsarList]);

  useEffect(() => {
    syncClientLocale();
    refresh();
  }, [refresh]);

  async function toggleConsent(type: string, action: "granted" | "revoked") {
    setBusy(true);
    try {
      await fnRecord({ data: { consent_type: type as ConsentType, action, language: lang } });
      await refresh();
      setMsg(t("privacy.saved"));
    } catch (e) {
      setMsg(errMsg(e));
    }
    setBusy(false);
  }

  async function doExport() {
    setBusy(true);
    try {
      const { json } = (await fnExport({})) as { json: string };
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iial-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await refresh();
      setMsg(t("privacy.exportDone"));
    } catch (e) {
      setMsg(errMsg(e));
    }
    setBusy(false);
  }

  async function doDelete() {
    if (!confirm(t("privacy.deleteConfirm"))) return;
    setBusy(true);
    try {
      await fnDelete({ data: { reason: null } });
      await refresh();
      setMsg(t("privacy.deleteRequested"));
    } catch (e) {
      setMsg(errMsg(e));
    }
    setBusy(false);
  }

  async function requestAccess(kind: "access" | "rectify") {
    setBusy(true);
    try {
      await fnDsar({ data: { kind, reason: null } });
      await refresh();
      setMsg(t("privacy.requestFiled"));
    } catch (e) {
      setMsg(errMsg(e));
    }
    setBusy(false);
  }

  const types = [
    "terms_of_service",
    "privacy_policy",
    "ai_processing",
    "cross_border_transfer",
    "marketing",
  ] as const;
  const latestByType: Record<string, Consent | undefined> = {};
  for (const c of consents) if (!latestByType[c.consent_type]) latestByType[c.consent_type] = c;

  return (
    <main className="min-h-screen bg-background text-foreground p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← {t("nav.dashboard")}
        </Link>
        <LanguageSwitcher />
      </header>

      <h1 className="text-2xl font-bold mb-2">{t("privacy.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("privacy.subtitle")}</p>

      {msg && <div className="mb-4 text-sm rounded border border-border bg-muted p-2">{msg}</div>}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("privacy.consents")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2">
            {types.map((tp) => {
              const last = latestByType[tp];
              const granted = last?.action === "granted";
              return (
                <li
                  key={tp}
                  className="flex items-center justify-between border-b border-border pb-2"
                >
                  <div>
                    <div className="font-medium">{t(`privacy.types.${tp}`)}</div>
                    <div className="text-xs text-muted-foreground">
                      {last ? `${last.action} · v${last.policy_version}` : t("privacy.notRecorded")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={granted ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => toggleConsent(tp, granted ? "revoked" : "granted")}
                  >
                    {granted ? t("privacy.revoke") : t("privacy.grant")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("privacy.dataRights")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={doExport} disabled={busy}>
              {t("privacy.exportData")}
            </Button>
            <Button variant="outline" onClick={() => requestAccess("access")} disabled={busy}>
              {t("privacy.requestAccess")}
            </Button>
            <Button variant="outline" onClick={() => requestAccess("rectify")} disabled={busy}>
              {t("privacy.requestRectify")}
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {t("privacy.requestDelete")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">{t("privacy.dsarSla")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("privacy.dsarHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {dsars.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("privacy.dsarEmpty")}</p>
          ) : (
            <ul className="text-sm divide-y divide-border">
              {dsars.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between">
                  <span>{t(`privacy.kinds.${d.kind}`)}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.status} · {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
