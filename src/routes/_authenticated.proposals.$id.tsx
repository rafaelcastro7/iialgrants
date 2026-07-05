import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getProposal } from "@/lib/proposals.functions";
import { submitProposal, exportProposalFile } from "@/lib/submissions.functions";
import { draftSection } from "@/agents/writer.functions";
import { runCritic } from "@/agents/critic.functions";
import { computeProposalReadiness, type ProposalRequirement } from "@/lib/proposal-readiness";
import { ProposalDetailExpress } from "@/components/proposals/ProposalDetailExpress";
import { SubmitDialog } from "@/components/SubmitDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

export const Route = createFileRoute("/_authenticated/proposals/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Proposal ${params.id.slice(0, 8)} - IIAL` }],
  }),
  component: ProposalDetailPage,
});

function ProposalDetailPage() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const fr = false; /* EN-only */
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProposal = useServerFn(getProposal);
  const draft = useServerFn(draftSection);
  const critic = useServerFn(runCritic);
  const submit = useServerFn(submitProposal);
  const exportFile = useServerFn(exportProposalFile);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const [pendingForce, setPendingForce] = useState(false);
  const [viewMode, setViewMode] = useState<"express" | "advanced">(() =>
    typeof window !== "undefined"
      ? ((window.sessionStorage.getItem("proposals.viewMode") as "express" | "advanced") ??
        "express")
      : "express",
  );
  const switchView = (mode: "express" | "advanced") => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.sessionStorage.setItem("proposals.viewMode", mode);
  };

  const { data } = useSuspenseQuery({
    queryKey: ["proposal", id],
    queryFn: () => fetchProposal({ data: { id } }),
  });

  useEffect(() => {
    syncClientLocale();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  async function onDraft(sectionId: string) {
    setPending(sectionId);
    setErr(null);
    try {
      await draft({ data: { sectionId, topK: 6 } });
      await qc.invalidateQueries({ queryKey: ["proposal", id] });
      toast.success("Section drafted successfully");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }
  async function onCritic() {
    setPending("critic");
    setErr(null);
    try {
      await critic({ data: { proposalId: id } });
      await qc.invalidateQueries({ queryKey: ["proposal", id] });
      toast.success("Quality review completed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  // Human-readable explanation for each S3a gate reason code.
  const GATE_REASONS: Record<string, string> = {
    no_sections_drafted: "no sections have been drafted yet",
    not_reviewed: "the proposal has not been run through the quality review",
    low_critic_score: "the quality review score is below the submit threshold",
    open_critical_requirements: "a critical funder requirement is not yet covered",
  };

  async function doSubmit(method: string, confirmationNumber: string, force = false) {
    setPending("submit");
    setErr(null);
    setSubmitDialogOpen(false);
    try {
      await submit({
        data: {
          proposalId: id,
          method: (["portal", "email", "mail", "api", "other"].includes(method)
            ? method
            : "other") as "portal" | "email" | "mail" | "api" | "other",
          confirmation_number: confirmationNumber || null,
          language: fr ? "fr" : "en",
          force,
        },
      });
      await qc.invalidateQueries({ queryKey: ["proposal", id] });
      toast.success("Proposal submitted successfully!");
      await navigate({ to: "/submissions" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("submit_blocked:") && !force) {
        const reasons = msg
          .slice("submit_blocked:".length)
          .split(",")
          .map((r) => GATE_REASONS[r] ?? r)
          .join("; ");
        setSubmitWarning(`This proposal isn't ready to submit: ${reasons}`);
        setSubmitDialogOpen(true);
        setPending(null);
        return;
      }
      setErr(msg);
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  async function onExport(format: "md" | "docx" | "pdf") {
    setPending(`export:${format}`);
    setErr(null);
    try {
      const r = await exportFile({ data: { id, language: fr ? "fr" : "en", format } });
      const bytes = Uint8Array.from(window.atob(r.base64), (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: r.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      if (fr && r.missingTranslations.length > 0) {
        setErr(
          `Export completed, but missing French translations: ${r.missingTranslations.join(", ")}`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const proposal = data.proposal;
  const grant = Array.isArray(proposal.grant) ? proposal.grant[0] : proposal.grant;
  const readiness = computeProposalReadiness({
    sections: data.sections,
    requirements: (grant?.requirements ?? []) as ProposalRequirement[],
  });
  const meta = (proposal.metadata ?? {}) as {
    critic_summary_en?: string;
    critic_summary_fr?: string;
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="font-semibold">
              {t("app.name")}
            </Link>
            <Link to="/proposals" className="text-sm text-muted-foreground hover:underline">
              {t("nav.proposals")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <div
              className="inline-flex rounded-lg border bg-card p-0.5"
              role="tablist"
              aria-label="View mode"
            >
              {(["express", "advanced"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === m}
                  onClick={() => switchView(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === m
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "express" ? "Express" : "Advanced"}
                </button>
              ))}
            </div>
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={signOut}>
              {t("nav.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {err && <p className="text-sm text-destructive">{err}</p>}

        {viewMode === "express" && (
          <ProposalDetailExpress
            title={proposal.title}
            readiness={readiness}
            pending={pending}
            onDraftSection={onDraft}
            onCritic={onCritic}
            onSubmit={() => {
              setSubmitWarning(null);
              setSubmitDialogOpen(true);
            }}
            onShowAdvanced={() => switchView("advanced")}
          />
        )}

        {viewMode === "advanced" && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{proposal.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="secondary">{t(`proposals.status.${proposal.status}`)}</Badge>
                  <span>
                    {t("proposals.version")} {proposal.version}
                  </span>
                  {proposal.critic_score != null && (
                    <span>
                      {t("proposals.score")}: {(Number(proposal.critic_score) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button onClick={onCritic} disabled={pending === "critic"}>
                  {pending === "critic" ? t("app.loading") : t("proposals.runCritic")}
                </Button>
                {(["md", "docx", "pdf"] as const).map((format) => (
                  <Button
                    key={format}
                    variant="secondary"
                    disabled={pending === `export:${format}`}
                    onClick={() => onExport(format)}
                  >
                    {pending === `export:${format}`
                      ? t("app.loading")
                      : format === "md"
                        ? t("proposals.exportMd")
                        : `Export ${format.toUpperCase()}`}
                  </Button>
                ))}
                {proposal.status !== "submitted" && (
                  <Button
                    variant="default"
                    disabled={pending === "submit"}
                    onClick={() => {
                      setSubmitWarning(null);
                      setSubmitDialogOpen(true);
                    }}
                  >
                    {t("proposals.submit")}
                  </Button>
                )}
              </div>
            </div>

            {(meta.critic_summary_en || meta.critic_summary_fr) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t("proposals.criticSummary")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {fr ? meta.critic_summary_fr : meta.critic_summary_en}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Proposal readiness</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Section coverage before submission, based on draft length, citations, planned
                      points, and critical grant requirements.
                    </p>
                  </div>
                  <Badge
                    variant={
                      readiness.score >= 80
                        ? "default"
                        : readiness.score >= 50
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {readiness.score}% ready
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <ReadinessMetric
                    label="Sections ready"
                    value={`${readiness.readySections}/${readiness.totalSections}`}
                  />
                  <ReadinessMetric
                    label="Critical requirements covered"
                    value={`${readiness.coveredCriticalRequirements}/${readiness.criticalRequirements}`}
                  />
                  <ReadinessMetric
                    label="Needs attention"
                    value={`${readiness.sections.filter((s) => s.status !== "ready").length}`}
                  />
                </div>

                {readiness.openCriticalRequirements.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-medium text-destructive">
                      Open critical requirement(s)
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {readiness.openCriticalRequirements.slice(0, 4).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  {readiness.sections.map((section) => (
                    <div
                      key={section.sectionId}
                      className="rounded-md border bg-muted/20 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{section.heading}</span>
                        <Badge
                          variant={
                            section.status === "ready"
                              ? "default"
                              : section.status === "partial"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {section.score}%
                        </Badge>
                      </div>
                      {section.issues.length > 0 && (
                        <p className="mt-1 text-muted-foreground">{section.issues.join(" ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {data.sections.map((s) => {
                const heading = fr && s.heading_fr ? s.heading_fr : s.heading_en;
                const content = fr && s.content_fr ? s.content_fr : s.content_en;
                const citations = (s.citations ?? []) as Array<{
                  marker: string;
                  chunk_id: string;
                  snippet: string;
                }>;
                const notes = (s.critic_notes ?? {}) as {
                  angle?: string;
                  must_cover?: string[];
                  findings?: Array<{ severity: string; message_en: string; message_fr: string }>;
                };
                return (
                  <Card key={s.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <CardTitle className="text-base">{heading}</CardTitle>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending === s.id}
                          onClick={() => onDraft(s.id)}
                        >
                          {pending === s.id ? t("app.loading") : t("proposals.draftSection")}
                        </Button>
                      </div>
                      {notes.angle && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{notes.angle}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {content ? (
                        <p className="text-sm whitespace-pre-wrap">{content}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                      {citations.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium mb-1">{t("proposals.citations")}</p>
                          <ul className="space-y-1">
                            {citations.map((c, i) => (
                              <li key={i}>
                                <span className="font-mono">{c.marker}</span> - {c.snippet}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {notes.findings && notes.findings.length > 0 && (
                        <div className="text-xs">
                          <p className="font-medium mb-1">{t("proposals.findings")}</p>
                          <ul className="space-y-1">
                            {notes.findings.map((f, i) => (
                              <li key={i}>
                                <Badge
                                  variant={f.severity === "block" ? "destructive" : "secondary"}
                                  className="mr-2"
                                >
                                  {f.severity}
                                </Badge>
                                {fr ? f.message_fr : f.message_en}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </section>

      <SubmitDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        onSubmit={(method, conf) => doSubmit(method, conf)}
        loading={pending === "submit"}
        warningMessage={submitWarning}
        onForceSubmit={
          submitWarning
            ? () => {
                setSubmitWarning(null);
                doSubmit("portal", "", true);
              }
            : undefined
        }
      />
    </main>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
