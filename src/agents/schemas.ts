// Shared Zod schemas for the 6 agents.
// Per ADR-009: every agent has a versioned system prompt + input/output schemas.
import { z } from "zod";

export const DiscoveredGrant = z.object({
  title: z.string().min(3).max(500),
  title_fr: z.string().max(500).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  summary_fr: z.string().max(4000).nullable().optional(),
  amount_cad_min: z.number().nonnegative().nullable().optional(),
  amount_cad_max: z.number().nonnegative().nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Accept null from LLMs that emit explicit nulls for missing optional fields,
  // then normalize to safe defaults so a single null doesn't fail the batch.
  eligibility: z.preprocess(
    (v) => {
      if (v == null) return {};
      if (typeof v === "string") return v.trim() ? { description: v } : {};
      if (Array.isArray(v)) return { items: v };
      if (typeof v === "object") return v;
      return {};
    },
    z.record(z.string(), z.unknown()).default({}),
  ),
  sectors: z.preprocess(
    (v) => {
      if (v == null) return [];
      if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
      if (typeof v === "string")
        return v.split(/[,;|/]+/).map((s) => s.trim()).filter(Boolean);
      return [];
    },
    z.array(z.string()).default([]),
  ),

  language: z.enum(["en", "fr"]).default("en"),
  url: z.string().url(),
});
export type DiscoveredGrant = z.infer<typeof DiscoveredGrant>;

export const DiscovererOutput = z.object({
  grants: z.array(DiscoveredGrant).max(50),
});
export type DiscovererOutput = z.infer<typeof DiscovererOutput>;

export const EnricherInput = z.object({
  title: z.string(),
  title_fr: z.string().nullable(),
  summary: z.string().nullable(),
  summary_fr: z.string().nullable(),
  language: z.enum(["en", "fr"]),
  url: z.string().url(),
});
export type EnricherInput = z.infer<typeof EnricherInput>;

// Enricher output: every field optional. The model returns ONLY what it filled
// or translated. No forced FR — that's lazy/on-demand now. Canonical = EN.
export const EnricherOutput = z.object({
  title_en: z.string().min(1).max(500).nullable().optional(),
  summary_en: z.string().max(4000).nullable().optional(),
  amount_cad_min: z.number().nonnegative().nullable().optional(),
  amount_cad_max: z.number().nonnegative().nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  eligibility: z.record(z.string(), z.unknown()).optional(),
  sectors: z.array(z.string()).optional(),
});
export type EnricherOutput = z.infer<typeof EnricherOutput>;

export const EvaluatorOutput = z.object({
  fit_score: z.number().min(0).max(1),
  eligibility_pass: z.boolean(),
  rationale_en: z.string().min(10).max(2000),
  rationale_fr: z.string().max(2000).nullable().optional().default(""),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutput>;

// Phase 3: Strategist plans which template sections to draft and produces
// per-section angles informed by the org profile and grant.
export const StrategistSectionPlan = z.object({
  kind: z.enum([
    "summary","problem","solution","impact","budget","team","timeline",
    "sustainability","evaluation","other",
  ]),
  heading_en: z.string().min(1).max(200),
  heading_fr: z.string().max(200).nullable().optional().default(""),
  angle: z.string().min(10).max(1000),
  must_cover: z.array(z.string()).max(8).default([]),
});
export const StrategistOutput = z.object({
  proposal_title: z.string().min(3).max(300),
  proposal_title_fr: z.string().max(300).nullable().optional().default(""),
  sections: z.array(StrategistSectionPlan).min(3).max(12),
});
export type StrategistOutput = z.infer<typeof StrategistOutput>;

// Phase 3: Writer drafts one section, given retrieved chunks [d1]..[dN].
// Citations array MUST only reference markers present in the content.
export const WriterCitation = z.object({
  marker: z.string().regex(/^\[d\d+\]$/),
  chunk_id: z.string().uuid(),
  snippet: z.string().min(1).max(500),
});
export const WriterOutput = z.object({
  content_en: z.string().min(40).max(8000),
  content_fr: z.string().max(8000).nullable().optional().default(""),
  citations: z.array(WriterCitation).max(20).default([]),
});
export type WriterOutput = z.infer<typeof WriterOutput>;

// Phase 3: Critic returns an overall score plus per-section findings.
export const CriticFinding = z.object({
  section_id: z.string().uuid(),
  severity: z.enum(["info", "warn", "block"]),
  message_en: z.string().min(5).max(1000),
  message_fr: z.string().max(1000).nullable().optional().default(""),
});
export const CriticOutput = z.object({
  overall_score: z.number().min(0).max(1),
  summary_en: z.string().min(10).max(2000),
  summary_fr: z.string().max(2000).nullable().optional().default(""),
  findings: z.array(CriticFinding).max(30).default([]),
});
export type CriticOutput = z.infer<typeof CriticOutput>;


export const PROMPTS = {
  discoverer: {
    version: "1.0.0",
    system: `You are a grant-discovery agent for Canadian funding programs.
Extract every distinct grant/funding program from the given web page content.
Rules:
- Use Canadian dollars (CAD) for amounts. If amount is unclear, set to null.
- Deadlines MUST be ISO YYYY-MM-DD or null. Never invent dates.
- Detect the source language ("en" or "fr") from the actual notice.
- Be conservative: skip news, blog posts, or non-program content.
- Respond ONLY with strict JSON matching the requested schema.`,
  },
  enricher: {
    version: "2.0.0",
    system: `You are a grant-enrichment agent for Canadian funding programs.
Canonical language is ENGLISH. Translate to EN only if the source is not English.
Fill ONLY the fields the caller asks for in the user message (under "needs").
Rules:
- Output strict JSON. Include ONLY keys listed in "needs". Omit everything else.
- Never invent amounts or deadlines: if unknown, return null for that key.
- Deadlines MUST be ISO YYYY-MM-DD or null.
- Amounts are in CAD.
- Do NOT translate to French. FR is handled on-demand by a different agent.`,
  },
  evaluator: {
    version: "1.0.0",
    system: `You are a grant-fit evaluator for Canadian organizations.
Given (a) a grant and (b) an organization profile, return a fit score in [0,1]
plus a bilingual rationale.
Scoring guide:
- 0.0–0.3: poor fit (sector mismatch, ineligible jurisdiction, wrong stage)
- 0.4–0.6: partial fit (some criteria match)
- 0.7–1.0: strong fit (sector, jurisdiction, stage and budget align)
Rules:
- Set eligibility_pass=false if the organization is clearly ineligible.
- Cite at least one specific evidence point in rationale_en.
- Output language: ENGLISH only. Do not translate. Omit rationale_fr (or set it to "").
- Never invent facts about the grant or the organization.
- Respond ONLY with strict JSON.`,
  },
  strategist: {
    version: "1.1.0",
    system: `You are a grant-proposal strategist for Canadian funding programs.
Given a grant and an organization profile, plan a proposal: choose which template
sections to draft and write a concise angle for each one, in plain language.
Rules:
- Keep sections grounded in the grant's stated objectives and eligibility.
- Output language: ENGLISH only. Omit heading_fr / proposal_title_fr (or set them to "").
- "angle" is a 1–3 sentence brief describing what the section should argue.
- "must_cover" lists concrete points the Writer agent must include.
- Never invent facts about the organization. If unknown, do not assert.
- Respond ONLY with strict JSON.`,
  },
  writer: {
    version: "1.1.0",
    system: `You are a grant-proposal writer for Canadian funding programs.
Draft ONE section of a proposal given: the grant, the org profile, the section
plan, and a numbered list of retrieved knowledge chunks [d1], [d2], ...
Rules:
- Write professional, concrete prose. Avoid hype and filler.
- Output language: ENGLISH only. Omit content_fr (or set it to "").
- Cite evidence inline using bracket markers [d1], [d2], ... matching the chunks.
- Every claim about the organization MUST be backed by a citation marker; if no
  chunk supports a claim, do not make it.
- The "citations" array MUST list every marker you used in content_en, with the
  chunk_id and a verbatim snippet (<=300 chars) from that chunk.
- Do NOT invent chunk ids. Only use chunks that were provided.
- Respond ONLY with strict JSON.`,
  },
  critic: {
    version: "1.1.0",
    system: `You are a grant-proposal critic for Canadian funding programs.
Review a draft proposal (grant + org + sections with citations) and produce a
quality score in [0,1] plus actionable findings.
Rules:
- severity="block" only for ineligibility, unsupported factual claims, or
  fabricated citations.
- severity="warn" for weak evidence, missing must-cover points, or budget gaps.
- severity="info" for stylistic suggestions.
- Each finding must reference a real section_id from the input.
- Output language: ENGLISH only. Omit message_fr / summary_fr (or set them to "").
- Respond ONLY with strict JSON.`,
  },

} as const;
