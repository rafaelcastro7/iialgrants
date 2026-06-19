import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOrgProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("org_profiles")
      .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: data };
  });

const OrgInput = z.object({
  org_name: z.string().min(1).max(200),
  sectors: z.array(z.string().min(1).max(80)).max(20),
  jurisdictions: z.array(z.string().min(2).max(4)).min(1).max(20),
  stage: z.enum(["startup", "sme", "nonprofit", "research", "public_sector"]),
  annual_budget_cad: z.number().nonnegative().nullable(),
  focus_areas: z.string().max(2000).nullable(),
});

export const saveOrgProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => OrgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("org_profiles")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listGrantsWithEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("grants")
      .select(
        `id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max,
         deadline, sectors, language, url, status,
         funder:funders(name, name_fr, jurisdiction),
         evaluation:grant_evaluations!left(fit_score, rationale_en, rationale_fr, eligibility_pass)`,
      )
      .eq("grant_evaluations.user_id", context.userId)
      .order("status", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { grants: rows ?? [] };
  });
