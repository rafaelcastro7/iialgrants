import { z } from "zod";

const terms = z.array(z.string().trim().min(1).max(100)).max(50).default([]);

export const SearchProfileInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    mission: z.string().trim().max(4000).default(""),
    activities: terms,
    populations_served: terms,
    funding_uses: terms,
    sectors: terms,
    jurisdictions: terms.default(["CA"]),
    applicant_types: terms,
    amount_min_cad: z.number().nonnegative().nullable().default(null),
    amount_max_cad: z.number().nonnegative().nullable().default(null),
    project_start: z.string().date().nullable().default(null),
    project_end: z.string().date().nullable().default(null),
    role: z.enum(["lead", "partner", "either"]).default("either"),
    required_terms: terms,
    excluded_terms: terms,
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (
      value.amount_min_cad != null &&
      value.amount_max_cad != null &&
      value.amount_min_cad > value.amount_max_cad
    ) {
      ctx.addIssue({ code: "custom", path: ["amount_max_cad"], message: "must be >= minimum" });
    }
    if (value.project_start && value.project_end && value.project_start > value.project_end) {
      ctx.addIssue({ code: "custom", path: ["project_end"], message: "must be after start" });
    }
  });

export const SearchFeedbackInput = z.object({
  profile_id: z.string().uuid(),
  grant_id: z.string().uuid(),
  action: z.enum(["saved", "hidden", "rejected", "restored", "pursued"]),
  reason: z
    .enum([
      "applicant_type",
      "jurisdiction",
      "sector",
      "population",
      "funding_use",
      "amount",
      "deadline",
      "capacity",
      "duplicate",
      "not_a_grant",
      "other",
    ])
    .nullable()
    .default(null),
  note: z.string().trim().max(2000).nullable().default(null),
  query_text: z.string().trim().max(500).nullable().default(null),
  rank_position: z.number().int().positive().nullable().default(null),
  score_snapshot: z.record(z.unknown()).default({}),
});

export type SearchProfileInput = z.infer<typeof SearchProfileInput>;
export type SearchFeedbackInput = z.infer<typeof SearchFeedbackInput>;
