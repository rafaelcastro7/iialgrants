"use server";

/**
 * Compliance Matrix System
 *
 * Validates proposals against funder requirements.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const REQUIREMENT_TEMPLATES: Record<string, Array<{ category: string; requirement: string }>> = {
  nrc_irap: [
    { category: "eligibility", requirement: "Canadian incorporated entity" },
    { category: "eligibility", requirement: "Less than 500 employees" },
    { category: "eligibility", requirement: "R&D focus (not commercialization)" },
    { category: "mandatory_sections", requirement: "Technical uncertainty demonstration" },
    { category: "mandatory_sections", requirement: "Project methodology" },
    { category: "mandatory_sections", requirement: "Budget justification" },
    { category: "financial", requirement: "Contribution Agreement before costs incurred" },
    { category: "financial", requirement: "Monthly claims with timesheets" },
    { category: "policy", requirement: "7-year document retention" },
  ],
  sshrc_insight: [
    { category: "mandatory_sections", requirement: "Research proposal (max 8 pages)" },
    { category: "mandatory_sections", requirement: "Budget justification (max 2 pages)" },
    { category: "mandatory_sections", requirement: "Team biographies (max 2 pages each)" },
    { category: "mandatory_sections", requirement: "Knowledge mobilization plan" },
    { category: "format", requirement: "Convergence Portal sections" },
    { category: "policy", requirement: "EDI in research design" },
    { category: "policy", requirement: "Open access policy compliance" },
    { category: "policy", requirement: "Tri-Agency data management plan" },
  ],
  general: [
    { category: "mandatory_sections", requirement: "Executive summary" },
    { category: "mandatory_sections", requirement: "Statement of need" },
    { category: "mandatory_sections", requirement: "Project methodology" },
    { category: "mandatory_sections", requirement: "Budget and justification" },
    { category: "mandatory_sections", requirement: "Organizational capacity" },
    { category: "mandatory_sections", requirement: "Evaluation plan" },
    { category: "format", requirement: "Page limits respected" },
    { category: "format", requirement: "Required attachments included" },
    { category: "eligibility", requirement: "Organization eligible" },
    { category: "policy", requirement: "EDI considerations addressed" },
  ],
};

export const generateComplianceMatrix = createServerFn({
  method: "POST",
  validator: z.object({
    proposalId: z.string().uuid(),
    funderType: z.string().default("general"),
    sections: z.array(
      z.object({
        title: z.string(),
        content: z.string(),
        wordCount: z.number(),
      }),
    ),
    attachments: z.array(z.string()).optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const template = REQUIREMENT_TEMPLATES[data.funderType] || REQUIREMENT_TEMPLATES.general;
  const fullContent = data.sections
    .map((s) => s.content)
    .join(" ")
    .toLowerCase();

  const checks = template.map((req, i) => {
    let status: "met" | "partial" | "not_met" | "not_applicable" = "not_met";
    let details = "";

    const relevantSection = data.sections.find(
      (s) =>
        s.title.toLowerCase().includes(req.requirement.toLowerCase().split(" ")[0] || "") ||
        s.content.toLowerCase().includes(req.requirement.toLowerCase().split(" ")[0] || ""),
    );

    if (relevantSection) {
      status = "met";
      details = `Found in section: ${relevantSection.title}`;
    } else if (fullContent.includes(req.requirement.toLowerCase().split(" ")[0] || "")) {
      status = "partial";
      details = "Referenced but not in a dedicated section";
    } else {
      details = "Not found in proposal content";
    }

    return {
      id: `check-${i}`,
      category: req.category,
      requirement: req.requirement,
      status,
      details,
      sectionRef: relevantSection?.title,
    };
  });

  const mandatoryChecks = checks.filter((c) => c.category === "mandatory_sections");
  const mandatoryMet = mandatoryChecks.filter((c) => c.status === "met").length;

  const overallScore = Math.round(
    (checks.filter((c) => c.status === "met").length / checks.length) * 100,
  );

  const matrix = {
    proposalId: data.proposalId,
    overallScore,
    checks,
    mandatoryMet,
    mandatoryTotal: mandatoryChecks.length,
    policyAlignment: {
      edi:
        fullContent.includes("equity") ||
        fullContent.includes("diversity") ||
        fullContent.includes("inclusion"),
      openAccess: fullContent.includes("open access") || fullContent.includes("publicly available"),
      dataManagement: fullContent.includes("data management") || fullContent.includes("data plan"),
      conflictOfInterest:
        fullContent.includes("conflict of interest") || fullContent.includes("disclosure"),
    },
  };

  const { error } = await supabase.from("compliance_matrices").upsert(
    {
      proposal_id: data.proposalId,
      overall_score: overallScore,
      mandatory_met: mandatoryMet,
      mandatory_total: mandatoryChecks.length,
      checks,
      policy_alignment: matrix.policyAlignment,
      created_at: new Date().toISOString(),
    },
    { onConflict: "proposal_id" },
  );

  if (error) console.error("Failed to store matrix:", error.message);

  return matrix;
});

export const getRequirementTemplates = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(() => {
  return Object.keys(REQUIREMENT_TEMPLATES).map((key) => ({
    id: key,
    name: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    requirementCount: REQUIREMENT_TEMPLATES[key].length,
  }));
});
