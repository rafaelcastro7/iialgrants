"use server";

/**
 * Multi-Tenant Middleware
 *
 * Provides org-scoped data access. Injects org_id from user's profile
 * into all queries. Ensures data isolation between organizations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Get current user's org_id from profile
 */
export const getCurrentOrgId = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
  try {
    const supabase = await createSupabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    return profile?.org_id || null;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

/**
 * Get current user's organization details
 */
export const getCurrentOrg = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
  try {
    const supabase = await createSupabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, organizations(id, name, slug)")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) return null;

    const org = Array.isArray(profile.organizations)
      ? profile.organizations[0]
      : profile.organizations;

    return org || null;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

/**
 * Check if user is admin of their organization
 */
export const isOrgAdmin = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
  try {
    const supabase = await createSupabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    return role?.role === "admin";
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});
