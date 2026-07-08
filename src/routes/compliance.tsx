import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { syncClientLocale } from "@/i18n/sync";
import "@/i18n";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance & Trust — IIAL" },
      {
        name: "description",
        content:
          "IIAL compliance posture: PIPEDA, Quebec Law 25 and Canada's AIDA (Bill C-27). Data residency Canada, bilingual EN/FR.",
      },
      { property: "og:title", content: "Compliance & Trust — IIAL" },
      {
        property: "og:description",
        content: "PIPEDA · Quebec Law 25 · AIDA · Canadian data residency.",
      },
    ],
  }),
  component: ComplianceRoute,
});

function ComplianceRoute() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    syncClientLocale();
  }, []);
  const fr = false; /* EN-only */

  return (
    <main className="min-h-screen bg-background text-foreground p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← {t("app.name")}
        </Link>
        <LanguageSwitcher />
      </header>

      <h1 className="font-display text-3xl tracking-tight mb-2">{t("compliance.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("compliance.maintainedBy")}</p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("compliance.dataResidency")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            {fr
              ? "Toutes les données client sont stockées localement sur l'infrastructure du client (PostgreSQL locale). Aucun transfert transfrontalier."
              : "All customer data is stored locally on self-hosted infrastructure (local PostgreSQL). No cross-border transfer occurs."}
          </p>
          <p>
            {fr
              ? "Tous les appels aux modèles IA sont traités localement via Ollama (localhost). Aucune donnée n'est envoyée à des API externes."
              : "All AI model calls are processed locally via Ollama (localhost). No data is sent to external APIs."}
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("compliance.frameworks")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>PIPEDA</strong> —{" "}
              {fr
                ? "Loi sur la protection des renseignements personnels et les documents électroniques."
                : "Personal Information Protection and Electronic Documents Act."}
            </li>
            <li>
              <strong>Quebec Law 25</strong> —{" "}
              {fr
                ? "Loi modernisant des dispositions législatives en matière de protection des renseignements personnels."
                : "Quebec modernization of personal information protection."}
            </li>
            <li>
              <strong>AIDA (Bill C-27)</strong> —{" "}
              {fr
                ? "Loi sur l'intelligence artificielle et les données (en cours d'adoption)."
                : "Artificial Intelligence and Data Act (pending)."}
            </li>
            <li>
              <strong>TBS Directive</strong> —{" "}
              {fr
                ? "Directive sur la prise de décision automatisée (référence pour les contrôles humains dans la boucle)."
                : "Treasury Board Directive on Automated Decision-Making (reference for human-in-the-loop controls)."}
            </li>
          </ul>
          <p className="text-xs text-muted-foreground pt-2">{t("compliance.notCertification")}</p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("compliance.aiTransparency")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            {fr
              ? "IIAL utilise 6 agents LLM (Discoverer, Enricher, Evaluator, Strategist, Writer, Critic) avec Gemini 2.5 Flash/Pro. Chaque exécution est tracée (OpenTelemetry GenAI) avec coûts, tokens, latence et statut. Les décisions assistées par IA restent sous contrôle humain : aucune soumission de subvention n'est automatiquement envoyée à un bailleur."
              : "IIAL uses 6 LLM agents (Discoverer, Enricher, Evaluator, Strategist, Writer, Critic) running on Gemini 2.5 Flash/Pro. Every run is traced (OpenTelemetry GenAI) with cost, tokens, latency and status. AI-assisted decisions remain under human control: no grant submission is automatically sent to a funder."}
          </p>
          <p>
            {fr
              ? "Le contenu généré inclut des citations vers les pièces sources (RAG) ; les hallucinations sans citation sont rejetées par le validateur Writer (ADR-005)."
              : "Generated content includes citations to source artifacts (RAG); hallucinations without a citation are rejected by the Writer validator (ADR-005)."}
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("compliance.rights")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {fr
                ? "Droit d'accès et de portabilité — exportez vos données en JSON depuis Paramètres → Confidentialité."
                : "Right of access and portability — export your data as JSON from Settings → Privacy."}
            </li>
            <li>
              {fr
                ? "Droit de rectification — modifiez votre profil et votre profil d'organisation à tout moment."
                : "Right of rectification — edit your profile and organization profile at any time."}
            </li>
            <li>
              {fr
                ? "Droit à l'effacement — demandez la suppression de votre compte ; traitement sous 30 jours."
                : "Right to erasure — request account deletion; processed within 30 days."}
            </li>
            <li>
              {fr
                ? "Droit de retrait du consentement — révoquez vos consentements depuis le ledger."
                : "Right to withdraw consent — revoke consents from the ledger."}
            </li>
          </ul>
          <div className="pt-3">
            <Link to="/privacy">
              <Button variant="outline" size="sm">
                {t("compliance.openPrivacyCenter")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("compliance.contact")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            {fr
              ? "Délégué à la protection des données / responsable de la vie privée : privacy@iial.ca."
              : "Privacy officer / Data Protection lead: privacy@iial.ca."}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
