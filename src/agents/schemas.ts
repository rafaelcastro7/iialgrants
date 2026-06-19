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

export const EnrichedGrant = DiscoveredGrant.extend({
  amount_cad_min: z.number().nonnegative().nullable(),
  amount_cad_max: z.number().nonnegative().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  title_fr: z.string().max(500),
  summary_fr: z.string().max(4000).nullable(),
});
export type EnrichedGrant = z.infer<typeof EnrichedGrant>;

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
    system: `You are a grant-enrichment agent. Given a partially-extracted Canadian grant,
fill missing fields (especially the French translation) and normalize amounts to CAD.
Rules:
- Translate title and summary to Quebec French (FR-CA) if missing.
- Never invent amounts or deadlines: leave null if unknown.
- Respond ONLY with strict JSON matching the requested schema.`,
  },
} as const;
