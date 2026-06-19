// Shared Zod schemas for the 6 agents (Phase 1: Discoverer + Enricher).
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
  eligibility: z.record(z.string(), z.unknown()).default({}),
  sectors: z.array(z.string()).default([]),
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

export const EnricherOutput = z.object({
  title_fr: z.string().min(1).max(500),
  summary_fr: z.string().max(4000).nullable(),
  amount_cad_min: z.number().nonnegative().nullable(),
  amount_cad_max: z.number().nonnegative().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  eligibility: z.record(z.string(), z.unknown()).default({}),
  sectors: z.array(z.string()).default([]),
});
export type EnricherOutput = z.infer<typeof EnricherOutput>;

export const EvaluatorOutput = z.object({
  fit_score: z.number().min(0).max(1),
  eligibility_pass: z.boolean(),
  rationale_en: z.string().min(10).max(2000),
  rationale_fr: z.string().min(10).max(2000),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutput>;

// Versioned system prompts (semantic versioning).
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
    version: "1.0.0",
    system: `You are a grant-enrichment agent for Canadian funding programs.
Given a partially-extracted grant, fill missing fields and produce a Quebec-French (FR-CA) translation.
Rules:
- Translate title and summary to Quebec French (FR-CA). The title_fr is REQUIRED.
- Normalize all amounts to Canadian dollars (CAD). Never invent amounts or deadlines: leave null if unknown.
- Deadlines MUST be ISO YYYY-MM-DD or null.
- Respond ONLY with strict JSON matching the requested schema.`,
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
- Set eligibility_pass=false if the organization is clearly ineligible
  (wrong country, wrong jurisdiction, ineligible stage).
- Cite at least one specific evidence point in each rationale.
- Provide BOTH rationale_en and rationale_fr (Quebec French).
- Never invent facts about the grant or the organization.
- Respond ONLY with strict JSON.`,
  },
} as const;
