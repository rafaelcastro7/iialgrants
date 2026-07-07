"use server";

/**
 * Multi-Tenant Middleware
 *
 * Provides org-scoped data access. Resolves org_id from the authenticated
 * user's profile. Ensures data isolation between organizations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Get current user's org_id from profile.
 */
export const getCurrentOrgId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", context.userId)
        .single();

      return profile?.org_id || null;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Get current user's organization details.
 */
export const getCurrentOrg = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, organizations(id, name, slug)")
        .eq("id", context.userId)
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
 * Check if the current user is an admin.
 */
export const isOrgAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .single();

      return role?.role === "admin";
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
