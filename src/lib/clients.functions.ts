"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSupabaseAdmin } from "./supabase-admin";

/**
 * List all organizations the current user has access to
 */
export const listUserOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = await createSupabaseAdmin();
    const { data, error } = await supabase
      .from("user_organizations")
      .select(`
        org_id,
        role,
        organizations:org_id (
          id,
          name,
          slug,
          created_at
        )
      `)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    const orgs = (data ?? []).map((row) => ({
      ...row.organizations,
      user_role: row.role,
    }));

    return { organizations: orgs };
  });

/**
 * Get a specific organization with full details for the client view
 */
export const getClientOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orgId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const supabase = await createSupabaseAdmin();

    // Verify user has access to this org
    const { data: membership } = await supabase
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership) {
      throw new Error("Access denied: not a member of this organization");
    }

    // Get organization details
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", data.orgId)
      .single();

    if (orgError) throw new Error(orgError.message);

    // Get org profile (grant readiness profile)
    const { data: profile } = await supabase
      .from("org_profiles")
      .select("*")
      .eq("org_id", data.orgId)
      .maybeSingle();

    // Get member count
    const { count: memberCount } = await supabase
      .from("user_organizations")
      .select("*", { count: "exact", head: true })
      .eq("org_id", data.orgId);

    // Get stats: grants, proposals, submissions for this org
    const [{ count: grantsCount }, { count: proposalsCount }, { count: submissionsCount }] =
      await Promise.all([
        supabase.from("grants").select("*", { count: "exact", head: true }).eq("org_id", data.orgId),
        supabase.from("proposals").select("*", { count: "exact", head: true }).eq("org_id", data.orgId),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("org_id", data.orgId),
      ]);

    return {
      organization: org,
      profile,
      membership: membership.role,
      stats: {
        memberCount: memberCount ?? 0,
        grantsCount: grantsCount ?? 0,
        proposalsCount: proposalsCount ?? 0,
        submissionsCount: submissionsCount ?? 0,
      },
    };
  });

/**
 * Create a new organization and link current user as owner
 */
export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const admin = await createSupabaseAdmin();

    // Generate slug if not provided
    const slug = data.slug ?? data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Check if slug exists
    const { data: existing } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      throw new Error("An organization with this name/slug already exists");
    }

    // Create organization
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: data.name, slug })
      .select("id")
      .single();

    if (orgError) throw new Error(orgError.message);

    // Link user as owner
    const { error: linkError } = await admin
      .from("user_organizations")
      .insert({ user_id: context.userId, org_id: org.id, role: "owner" });

    if (linkError) throw new Error(linkError.message);

    // Also update profiles.org_id for backward compatibility (first org only)
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .single();

    if (!existingProfile?.org_id) {
      await admin
        .from("profiles")
        .update({ org_id: org.id })
        .eq("id", context.userId);
    }

    return { organization: org };
  });

/**
 * Invite a user to an organization
 */
export const inviteUserToOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      orgId: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(["admin", "member", "viewer"]).default("member"),
    })
  )
  .handler(async ({ data, context }) => {
    const admin = await createSupabaseAdmin();

    // Verify current user is owner/admin of the org
    const { data: membership } = await admin
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Only owners and admins can invite users");
    }

    // Find user by email
    const { data: userData } = await admin.auth.admin.listUsers();
    const targetUser = userData.users.find((u) => u.email === data.email);

    if (!targetUser) {
      throw new Error("User not found with this email");
    }

    // Check if already a member
    const { data: existing } = await admin
      .from("user_organizations")
      .select("user_id")
      .eq("user_id", targetUser.id)
      .eq("org_id", data.orgId)
      .maybeSingle();

    if (existing) {
      throw new Error("User is already a member of this organization");
    }

    // Add membership
    const { error } = await admin
      .from("user_organizations")
      .insert({ user_id: targetUser.id, org_id: data.orgId, role: data.role });

    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * Remove a user from an organization
 */
export const removeUserFromOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      orgId: z.string().uuid(),
      userId: z.string().uuid(),
    })
  )
  .handler(async ({ data, context }) => {
    const admin = await createSupabaseAdmin();

    // Verify current user is owner of the org
    const { data: membership } = await admin
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can remove members");
    }

    // Prevent removing self
    if (data.userId === context.userId) {
      throw new Error("Cannot remove yourself from the organization");
    }

    // Remove membership
    const { error } = await admin
      .from("user_organizations")
      .delete()
      .eq("user_id", data.userId)
      .eq("org_id", data.orgId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * Update user role in organization
 */
export const updateUserOrganizationRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      orgId: z.string().uuid(),
      userId: z.string().uuid(),
      role: z.enum(["admin", "member", "viewer"]),
    })
  )
  .handler(async ({ data, context }) => {
    const admin = await createSupabaseAdmin();

    // Verify current user is owner/admin of the org
    const { data: membership } = await admin
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Only owners and admins can update roles");
    }

    // Prevent changing owner role
    const { data: targetMembership } = await admin
      .from("user_organizations")
      .select("role")
      .eq("user_id", data.userId)
      .eq("org_id", data.orgId)
      .single();

    if (targetMembership?.role === "owner") {
      throw new Error("Cannot change owner role");
    }

    // Update role
    const { error } = await admin
      .from("user_organizations")
      .update({ role: data.role })
      .eq("user_id", data.userId)
      .eq("org_id", data.orgId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * List members of an organization
 */
export const listOrganizationMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orgId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const admin = await createSupabaseAdmin();

    // Verify access
    const { data: membership } = await admin
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Get members with user details
    const { data: members, error } = await admin
      .from("user_organizations")
      .select(`
        user_id,
        role,
        created_at,
        profiles:user_id (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq("org_id", data.orgId);

    if (error) throw new Error(error.message);

    return { members: members ?? [] };
  });

/**
 * Get grants evaluated for a specific organization (for grant matching view)
 */
export const listGrantsForOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      orgId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(100),
      status: z.string().optional(),
      minFitScore: z.number().min(0).max(100).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const supabase = await createSupabaseAdmin();

    // Verify access
    const { data: membership } = await supabase
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership) {
      throw new Error("Access denied");
    }

    let query = supabase
      .from("grants")
      .select(
        `id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max,
         deadline, sectors, language, url, status, created_at,
         funder:funders(id, name, name_fr, jurisdiction),
         evaluation:grant_evaluations!left(fit_score, rationale_en, rationale_fr, eligibility_pass, created_at)`
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status) {
      query = query.eq("status", data.status);
    }

    const { data: grants, error } = await query;

    if (error) throw new Error(error.message);

    // Filter by min fit score if provided
    let filtered = grants ?? [];
    if (data.minFitScore !== undefined) {
      filtered = filtered.filter((g) => (g.evaluation?.fit_score ?? 0) >= data.minFitScore!);
    }

    return { grants: filtered };
  });

/**
 * Switch current organization context (for backward compatibility with profiles.org_id)
 */
export const switchOrganizationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orgId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const admin = await createSupabaseAdmin();

    // Verify user is member of this org
    const { data: membership } = await admin
      .from("user_organizations")
      .select("role")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId)
      .single();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Update profiles.org_id for backward compatibility
    const { error } = await admin
      .from("profiles")
      .update({ org_id: data.orgId })
      .eq("id", context.userId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });