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
import { useUiVersion } from "@/components/v2/ui-version";
import { Send, Trophy, Clock3, Percent } from "lucide-react";
import "@/i18n";

const opts = queryOptions({ queryKey: ["submissions"], queryFn: () => listSubmissions() });

export const Route = createFileRoute("/_authenticated/submissions")({
  head: () => ({ meta: [{ title: "Submissions — IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  pendingComponent: SubmissionsSkeleton,
  component: SubmissionsPage,
});

type SubmissionRow = Awaited<ReturnType<typeof listSubmissions>>["submissions"][number];

function SubmissionsPage() {
  const { t } = useTranslation();
  const { version } = useUiVersion();
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

  if (version === "v2") {
    return (
      <SubmissionsPageV2
        submissions={data.submissions}
        editing={editing}
        setEditing={setEditing}
        form={form}
        setForm={setForm}
        err={err}
        onSave={onSave}
      />
    );
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

// -----------------------------------------------------------------------------
// V2 — friendly redesign (presentation only; same submissions/editing/onSave)
// -----------------------------------------------------------------------------

const RESULT_PILL: Record<string, { label: string; cls: string }> = {
  won: { label: "Won", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  lost: { label: "Not this time", cls: "border-rose-500/30 bg-rose-500/10 text-rose-700" },
  withdrawn: { label: "Withdrawn", cls: "border-border bg-muted/60 text-muted-foreground" },
  no_response: { label: "Waiting", cls: "border-amber-500/30 bg-amber-500/10 text-amber-700" },
};

function SubmissionsPageV2({
  submissions,
  editing,
  setEditing,
  form,
  setForm,
  err,
  onSave,
}: {
  submissions: SubmissionRow[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  form: { result: string; amount: string; date: string; feedback: string };
  setForm: (f: { result: string; amount: string; date: string; feedback: string }) => void;
  err: string | null;
  onSave: (subId: string) => void;
}) {
  const outcomes = submissions.map((s) => {
    const oc = (
      s.outcome as Array<{
        result: string;
        amount_awarded_cad: number | null;
        decision_date: string | null;
      }> | null
    )?.[0];
    return oc?.result ?? null;
  });
  const won = outcomes.filter((r) => r === "won").length;
  const waiting = outcomes.filter((r) => r == null).length;
  const decided = outcomes.filter((r) => r != null).length;
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

  return (
    <div className="min-h-screen text-foreground">
      <section className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Submissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            What's out the door, and how it's going.
          </p>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="grid gap-3 sm:grid-cols-4">
          <SubmissionStat icon={Send} label="Sent" value={submissions.length} />
          <SubmissionStat icon={Trophy} label="Won" value={won} />
          <SubmissionStat icon={Clock3} label="Waiting" value={waiting} />
          <SubmissionStat icon={Percent} label="Win rate" value={decided > 0 ? `${winRate}%` : "—"} />
        </div>

        {submissions.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
            <h2 className="text-base font-semibold">Nothing sent yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Applications you send will show up here so you can track their outcome.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => {
              const grant = s.grant as { id: string; title: string; title_fr: string | null } | null;
              const oc = (
                s.outcome as Array<{
                  result: string;
                  amount_awarded_cad: number | null;
                  decision_date: string | null;
                }> | null
              )?.[0];
              const pill = oc ? RESULT_PILL[oc.result] : null;

              return (
                <div key={s.id} className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold leading-snug">{grant?.title}</span>
                        {pill && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pill.cls}`}
                          >
                            {pill.label}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sent {new Date(s.submitted_at as string).toLocaleDateString("en-CA")}
                        {oc?.amount_awarded_cad != null && ` · $${oc.amount_awarded_cad.toLocaleString()}`}
                        {oc?.decision_date && ` · Decided ${oc.decision_date}`}
                      </p>
                    </div>
                    {!oc &&
                      (editing === s.id ? null : (
                        <Button size="sm" variant="outline" onClick={() => setEditing(s.id)}>
                          Record what happened
                        </Button>
                      ))}
                  </div>

                  {!oc && editing === s.id && (
                    <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
                      <div>
                        <Label>Result</Label>
                        <select
                          className="h-10 w-full rounded-md border bg-background px-2"
                          value={form.result}
                          onChange={(e) => setForm({ ...form, result: e.target.value })}
                        >
                          <option value="won">Won</option>
                          <option value="lost">Not this time</option>
                          <option value="withdrawn">Withdrawn</option>
                          <option value="no_response">Still waiting</option>
                        </select>
                      </div>
                      <div>
                        <Label>Amount awarded (CAD)</Label>
                        <Input
                          type="number"
                          value={form.amount}
                          onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Decision date</Label>
                        <Input
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm({ ...form, date: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Feedback from the funder (optional)</Label>
                        <Input
                          value={form.feedback}
                          onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button size="sm" onClick={() => onSave(s.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SubmissionStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Send;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <p className="text-xs">{label}</p>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
