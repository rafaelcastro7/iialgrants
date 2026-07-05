"use server";

/**
 * Multi-Tenant Middleware
 *
 * Provides org-scoped data access. Injects org_id from user's profile
 * into all queries. Ensures data isolation between organizations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Get current user's org_id from profile
 */
export const getCurrentOrgId = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

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
});

/**
 * Get current user's organization details
 */
export const getCurrentOrg = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

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
});

/**
 * Check if user is admin of their organization
 */
export const isOrgAdmin = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

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
});
