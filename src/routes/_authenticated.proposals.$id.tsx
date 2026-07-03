import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getProposal } from "@/lib/proposals.functions";
import { submitProposal, exportProposalMarkdown } from "@/lib/submissions.functions";
import { draftSection } from "@/agents/writer.functions";
import { runCritic } from "@/agents/critic.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

export const Route = createFileRoute("/_authenticated/proposals/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Proposal ${params.id.slice(0, 8)} — IIAL` }],
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
  const exportMd = useServerFn(exportProposalMarkdown);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const proposal = data.proposal;
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
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={signOut}>
              {t("nav.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{proposal.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              <Badge variant="secondary">{t(`proposals.status.${proposal.status}`)}</Badge>
              <span className="ml-2">
                {t("proposals.version")} {proposal.version}
              </span>
              {proposal.critic_score != null && (
                <span className="ml-2">
                  {t("proposals.score")}: {(Number(proposal.critic_score) * 100).toFixed(0)}%
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button onClick={onCritic} disabled={pending === "critic"}>
              {pending === "critic" ? t("app.loading") : t("proposals.runCritic")}
            </Button>
            <Button
              variant="secondary"
              disabled={pending === "export"}
              onClick={async () => {
                setPending("export");
                setErr(null);
                try {
                  const r = await exportMd({ data: { id, language: fr ? "fr" : "en" } });
                  const blob = new Blob([r.markdown], { type: "text/markdown;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = r.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setPending(null);
                }
              }}
            >
              {t("proposals.exportMd")}
            </Button>
            {proposal.status !== "submitted" && (
              <Button
                variant="default"
                disabled={pending === "submit"}
                onClick={async () => {
                  const method = window.prompt(t("proposals.submitPrompt"), "portal");
                  if (!method) return;
                  const conf = window.prompt(t("proposals.confirmationPrompt"), "") || "";
                  setPending("submit");
                  setErr(null);
                  try {
                    await submit({
                      data: {
                        proposalId: id,
                        method: (["portal", "email", "mail", "api", "other"].includes(method)
                          ? method
                          : "other") as "portal" | "email" | "mail" | "api" | "other",
                        confirmation_number: conf || null,
                        language: fr ? "fr" : "en",
                      },
                    });
                    await qc.invalidateQueries({ queryKey: ["proposal", id] });
                    await navigate({ to: "/submissions" });
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setPending(null);
                  }
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

        {err && <p className="text-sm text-destructive">{err}</p>}

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
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                  {citations.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium mb-1">{t("proposals.citations")}</p>
                      <ul className="space-y-1">
                        {citations.map((c, i) => (
                          <li key={i}>
                            <span className="font-mono">{c.marker}</span> — {c.snippet}
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
      </section>
    </main>
  );
}
