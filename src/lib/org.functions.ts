import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSupabaseAdmin } from "./supabase-admin";
import { getOrgProfileForUser } from "@/lib/org-profile-query";

export const getOrgProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await getOrgProfileForUser(context.supabase, context.userId);
    if (error) throw new Error(error.message);
    return { profile: data };
  });

const OrgInput = z
  .object({
    org_name: z.string().min(1).max(200),
    sectors: z.array(z.string().min(1).max(80)).max(20),
    jurisdictions: z.array(z.string().min(2).max(4)).min(1).max(20),
    stage: z.enum(["startup", "sme", "nonprofit", "research", "public_sector"]),
    annual_budget_cad: z.number().nonnegative().nullable(),
    focus_areas: z.string().max(2000).nullable(),
    legal_name: z.string().max(240).nullable(),
    business_number: z.string().max(80).nullable(),
    website: z.string().max(500).nullable(),
    mission: z.string().max(4000).nullable(),
    applicant_types: z.array(z.string().min(1).max(80)).max(20),
    activities: z.array(z.string().min(1).max(120)).max(30),
    capabilities: z.array(z.string().min(1).max(120)).max(30),
    populations_served: z.array(z.string().min(1).max(120)).max(30),
    operating_regions: z.array(z.string().min(1).max(80)).max(30),
    languages: z.array(z.string().min(2).max(10)).min(1).max(20),
    years_operating: z.number().int().min(0).max(500).nullable(),
    employee_count: z.number().int().min(0).max(10_000_000).nullable(),
    registration_status: z
      .enum([
        "registered_charity",
        "nonprofit",
        "for_profit",
        "public_body",
        "academic",
        "indigenous",
        "unregistered",
        "other",
      ])
      .nullable(),
    funding_min_cad: z.number().nonnegative().nullable(),
    funding_max_cad: z.number().nonnegative().nullable(),
    cost_share_max_pct: z.number().min(0).max(100).nullable(),
    indirect_cost_rate_pct: z.number().min(0).max(100).nullable(),
  })
  .refine(
    (value) =>
      value.funding_min_cad == null ||
      value.funding_max_cad == null ||
      value.funding_min_cad <= value.funding_max_cad,
    { message: "Funding minimum cannot exceed maximum", path: ["funding_max_cad"] },
  );

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "org"
  );
}

export const saveOrgProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => OrgInput.parse(input))
  .handler(async ({ data, context }) => {
    // Matches the submissions/submitProposal convention: gate the write
    // action, not reads (getOrgProfile stays open). Previously nothing
    // checked this -- toggling "Organization profile and RAG knowledge"
    // off in /admin/modules did nothing.
    const { assertModuleEnabled } = await import("@/lib/admin-modules.server");
    await assertModuleEnabled("org_profile");
    // Real bug, confirmed live: `organizations` + `profiles.org_id` (the
    // actual multi-tenant grouping team collaboration's RLS checks — see
    // can_access_tenant_entity() and assertEntityInUserOrg) were never
    // populated by anything in the app. org_profiles above is a *different*,
    // single-user RAG blob; saving it never touched org_id. Result: every
    // profile.org_id stayed NULL forever, so "same org" was never true for
    // anyone and Team Collaboration (tasks/comments/documents sharing) was
    // unreachable by design even though its schema and policies are correct.
    // Find-or-create an organization by a slug of the org name and adopt it
    // once — first-write-wins, so re-saving a profile never silently moves a
    // user out of an org they already joined. A real invite/join-code flow
    // would be more robust for two orgs sharing a name, but this closes the
    // "nothing is ever assigned" gap with the same identity a person already
    // types in this exact form.
    const { data: profile, error: profileErr } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    let orgId = profile?.org_id ?? null;
    if (!orgId) {
      // organizations has no INSERT policy (SELECT-only — see "Users can
      // view their own organization" / org_member_r), so this one step needs
      // the admin client; the profiles update right after is scoped to the
      // caller's own row (profiles_self_update) and would work under RLS too,
      // but sharing one client keeps this block's error handling uniform.
      const admin = await createSupabaseAdmin();
      const slug = slugify(data.org_name);
      const { data: org, error: orgErr } = await admin
        .from("organizations")
        .upsert({ name: data.org_name, slug }, { onConflict: "slug", ignoreDuplicates: false })
        .select("id")
        .single();
      if (orgErr) throw new Error(orgErr.message);
      const { error: linkErr } = await admin
        .from("profiles")
        .update({ org_id: org.id })
        .eq("id", context.userId);
      if (linkErr) throw new Error(linkErr.message);
      orgId = org.id;
    }

    const { data: existing, error: existingError } = await getOrgProfileForUser(
      context.supabase,
      context.userId,
    );
    if (existingError) throw new Error(existingError.message);
    const payload = {
      ...data,
      org_id: orgId,
      profile_updated_by: context.userId,
    };
    const write = existing
      ? context.supabase.from("org_profiles").update(payload).eq("user_id", existing.user_id)
      : context.supabase.from("org_profiles").insert({ user_id: context.userId, ...payload });
    const { data: saved, error: saveError } = await write.select("user_id").maybeSingle();
    if (saveError) throw new Error(saveError.message);
    if (!saved) throw new Error("org_profile_not_authorized");

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
