import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { listSubmissions, recordOutcome } from "@/lib/submissions.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/DataTable";
import { syncClientLocale } from "@/i18n/sync";
import { AppTopBar } from "@/components/AppSidebar";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { SubmissionsSkeleton } from "@/components/Skeletons";
import "@/i18n";

const opts = queryOptions({ queryKey: ["submissions"], queryFn: () => listSubmissions() });

export const Route = createFileRoute("/_authenticated/submissions")({
  head: () => ({ meta: [{ title: "Submissions — IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  pendingComponent: SubmissionsSkeleton,
  component: SubmissionsPage,
});

function SubmissionsPage() {
  const { t } = useTranslation();
  const fr = false; /* EN-only */
  const qc = useQueryClient();
  const fetchSubs = useServerFn(listSubmissions);
  const outcome = useServerFn(recordOutcome);
  const { data } = useSuspenseQuery({ queryKey: ["submissions"], queryFn: () => fetchSubs() });
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{
    result: string;
    amount: string;
    date: string;
    feedback: string;
  }>({
    result: "won",
    amount: "",
    date: "",
    feedback: "",
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    syncClientLocale();
  }, []);

  async function onSave(subId: string) {
    setErr(null);
    try {
      await outcome({
        data: {
          submissionId: subId,
          result: form.result as "won" | "lost" | "withdrawn" | "no_response",
          amount_awarded_cad: form.amount ? Number(form.amount) : null,
          decision_date: form.date || null,
          feedback: form.feedback || null,
        },
      });
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["submissions"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen">
      <AppTopBar title={t("submissions.title")} />

      <PageContainer size="default">
        <PageHeader eyebrow="Pipeline" title={t("submissions.title")} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        {data.submissions.length === 0 && (
          <p className="text-muted-foreground">{t("submissions.empty")}</p>
        )}
        {data.submissions.map((s) => {
          const grant = s.grant as { id: string; title: string; title_fr: string | null } | null;
          const oc = (
            s.outcome as Array<{
              result: string;
              amount_awarded_cad: number | null;
              decision_date: string | null;
            }> | null
          )?.[0];
          return (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between gap-3">
                  <span>{(fr && grant?.title_fr) || grant?.title}</span>
                  <Badge variant="outline">{s.method}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-muted-foreground">
                  {t("submissions.submittedAt")}:{" "}
                  {new Date(s.submitted_at as string).toLocaleString()}
                  {s.confirmation_number && <> · #{s.confirmation_number}</>}
                </div>
                {oc ? (
                  <div className="flex gap-2 items-center">
                    <Badge>{t(`submissions.results.${oc.result}`)}</Badge>
                    {oc.amount_awarded_cad != null && <span>CAD {oc.amount_awarded_cad}</span>}
                    {oc.decision_date && (
                      <span className="text-muted-foreground">· {oc.decision_date}</span>
                    )}
                  </div>
                ) : editing === s.id ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label>{t("submissions.result")}</Label>
                      <select
                        className="w-full h-10 px-2 rounded-md border bg-background"
                        value={form.result}
                        onChange={(e) => setForm({ ...form, result: e.target.value })}
                      >
                        <option value="won">{t("submissions.results.won")}</option>
                        <option value="lost">{t("submissions.results.lost")}</option>
                        <option value="withdrawn">{t("submissions.results.withdrawn")}</option>
                        <option value="no_response">{t("submissions.results.no_response")}</option>
                      </select>
                    </div>
                    <div>
                      <Label>{t("submissions.amount")}</Label>
                      <Input
                        type="number"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t("submissions.decisionDate")}</Label>
                      <Input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>{t("submissions.feedback")}</Label>
                      <Input
                        value={form.feedback}
                        onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button size="sm" onClick={() => onSave(s.id)}>
                        {t("submissions.save")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        {t("submissions.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(s.id)}>
                    {t("submissions.recordOutcome")}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </PageContainer>
    </div>
  );
}
