"use server";

/**
 * Reporting Templates — Pre-built funder report templates
 * Logic Model — Theory of change binding
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Reporting Templates ──────────────────────────────────────

const BUILTIN_TEMPLATES = [
  {
    id: "nrc-irap-progress",
    name: "NRC IRAP Progress Report",
    funder: "NRC",
    sections: [
      { title: "Project Summary", description: "Brief overview of project status and milestones" },
      { title: "Technical Progress", description: "Detailed technical achievements vs planned" },
      { title: "Budget Summary", description: "Expenditures to date vs budget" },
      { title: "Challenges & Risks", description: "Key challenges and mitigation strategies" },
      { title: "Next Period Plan", description: "Planned activities for next reporting period" },
    ],
  },
  {
    id: "sshrc-progress",
    name: "SSHRC Progress Report",
    funder: "SSHRC",
    sections: [
      { title: "Research Progress", description: "Progress toward research objectives" },
      { title: "Knowledge Dissemination", description: "Publications, presentations, outreach" },
      { title: "Training & Mentoring", description: "Student supervision and training activities" },
      { title: "Budget & Resources", description: "Financial summary and resource utilization" },
    ],
  },
  {
    id: "canada-council-progress",
    name: "Canada Council Progress Report",
    funder: "Canada Council for the Arts",
    sections: [
      { title: "Artistic Progress", description: "Progress on artistic goals and creative work" },
      { title: "Community Impact", description: "Impact on community and audience engagement" },
      { title: "Financial Report", description: "Budget utilization and remaining funds" },
      { title: "Dissemination", description: "How results will be shared" },
    ],
  },
  {
    id: "generic-annual",
    name: "Generic Annual Report",
    funder: "Any",
    sections: [
      { title: "Executive Summary", description: "High-level overview of grant outcomes" },
      { title: "Objectives & Outcomes", description: "Stated objectives vs actual outcomes" },
      { title: "Financial Summary", description: "Complete budget vs actual breakdown" },
      { title: "Impact & Beneficiaries", description: "Who benefited and how" },
      { title: "Lessons Learned", description: "Key insights and recommendations" },
      { title: "Sustainability Plan", description: "How outcomes will be sustained" },
    ],
  },
] as const;

export const getReportingTemplates = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  return BUILTIN_TEMPLATES;
});

export const getReportingTemplate = createServerFn({
  method: "GET",
  validator: z.object({ templateId: z.string() }),
}).handler(async ({ data }) => {
  return BUILTIN_TEMPLATES.find((t) => t.id === data.templateId) || null;
});

// ─── Logic Model ──────────────────────────────────────────────

export const getLogicModel = createServerFn({
  method: "GET",
  validator: z.object({ proposalId: z.string().uuid() }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: model, error } = await supabase
    .from("logic_models")
    .select("*")
    .eq("proposal_id", data.proposalId)
    .single();

  if (error && error.code !== "PGRST116")
    throw new Error(`Failed to fetch logic model: ${error.message}`);
  return model || null;
});

export const upsertLogicModel = createServerFn({
  method: "POST",
  validator: z.object({
    proposalId: z.string().uuid(),
    inputs: z.array(z.string()).default([]),
    activities: z.array(z.string()).default([]),
    outputs: z.array(z.string()).default([]),
    outcomes: z.array(z.string()).default([]),
    impact: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: existing } = await supabase
    .from("logic_models")
    .select("id")
    .eq("proposal_id", data.proposalId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("logic_models")
      .update({
        inputs: data.inputs,
        activities: data.activities,
        outputs: data.outputs,
        outcomes: data.outcomes,
        impact: data.impact,
        assumptions: data.assumptions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw new Error(`Failed to update logic model: ${error.message}`);
    return { id: existing.id, action: "updated" };
  }

  const { data: model, error } = await supabase
    .from("logic_models")
    .insert({
      proposal_id: data.proposalId,
      inputs: data.inputs,
      activities: data.activities,
      outputs: data.outputs,
      outcomes: data.outcomes,
      impact: data.impact,
      assumptions: data.assumptions,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create logic model: ${error.message}`);
  return { id: model.id, action: "created" };
});
