import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Resolve the organization profile as a tenant-owned record.
 *
 * This module contains no credentials or server-only state: createServerFn
 * modules may safely import it while their actual database client remains in
 * the server handler.
 */
export async function getOrgProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data: member, error: memberError } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (memberError) return { data: null, error: memberError };

  if (member?.org_id) {
    const byTenant = await supabase
      .from("org_profiles")
      .select("*")
      .eq("org_id", member.org_id)
      .maybeSingle();
    if (byTenant.error || byTenant.data) return byTenant;
  }

  return supabase.from("org_profiles").select("*").eq("user_id", userId).maybeSingle();
}

