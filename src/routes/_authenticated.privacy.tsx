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
import { useUiVersion } from "@/components/v2/ui-version";
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
  const { version } = useUiVersion();
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

  if (version === "v2") {
    return (
      <PrivacyCenterV2
        types={types}
        latestByType={latestByType}
        dsars={dsars}
        msg={msg}
        busy={busy}
        t={t}
        toggleConsent={toggleConsent}
        doExport={doExport}
        requestAccess={requestAccess}
        doDelete={doDelete}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← {t("nav.dashboard")}
        </Link>
        <LanguageSwitcher />
      </header>

      <h1 className="font-display text-2xl tracking-tight mb-2">{t("privacy.title")}</h1>
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

// -----------------------------------------------------------------------------
// V2 — friendly redesign (presentation only; same consent/DSAR handlers as v1)
// -----------------------------------------------------------------------------

const LOCAL_FIRST_POINTS = [
  {
    title: "Your data stays local",
    body: "The database and AI models run on your own infrastructure — nothing is sent to a third-party cloud LLM.",
  },
  {
    title: "You control every consent",
    body: "Turn any consent on or off below. Changes take effect immediately and are logged with a timestamp.",
  },
  {
    title: "Export anytime",
    body: "Download a complete copy of your data as a JSON file, whenever you want it.",
  },
  {
    title: "Delete on request",
    body: "Ask for your account to be deleted and we'll process it — no hidden retention.",
  },
];

function PrivacyCenterV2({
  types,
  latestByType,
  dsars,
  msg,
  busy,
  t,
  toggleConsent,
  doExport,
  requestAccess,
  doDelete,
}: {
  types: readonly string[];
  latestByType: Record<string, Consent | undefined>;
  dsars: Dsar[];
  msg: string | null;
  busy: boolean;
  t: (key: string) => string;
  toggleConsent: (type: string, action: "granted" | "revoked") => void;
  doExport: () => void;
  requestAccess: (kind: "access" | "rectify") => void;
  doDelete: () => void;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-background p-6 text-foreground">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <LanguageSwitcher />
      </header>

      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        What we promise, and how to manage your own data.
      </p>

      {msg && <div className="mt-4 rounded border bg-muted p-2 text-sm">{msg}</div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {LOCAL_FIRST_POINTS.map((point) => (
          <div key={point.title} className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">{point.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{point.body}</p>
          </div>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Your consents</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {types.map((tp) => {
              const last = latestByType[tp];
              const granted = last?.action === "granted";
              return (
                <li
                  key={tp}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <div className="font-medium">{t(`privacy.types.${tp}`)}</div>
                    <div className="text-xs text-muted-foreground">
                      {last ? `${last.action} · v${last.policy_version}` : "Not recorded yet"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={granted ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => toggleConsent(tp, granted ? "revoked" : "granted")}
                  >
                    {granted ? "Turn off" : "Turn on"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={doExport} disabled={busy}>
              Download my data
            </Button>
            <Button variant="outline" onClick={() => requestAccess("access")} disabled={busy}>
              Request a copy
            </Button>
            <Button variant="outline" onClick={() => requestAccess("rectify")} disabled={busy}>
              Ask us to fix something
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              Delete my account
            </Button>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">{t("privacy.dsarSla")}</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Request history</CardTitle>
        </CardHeader>
        <CardContent>
          {dsars.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing requested yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {dsars.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
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
