import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Resolve the organization profile as a tenant-owned record.
 *
 * Older callers queried org_profiles.user_id directly. That made two members
 * of IIAL evaluate the same grant against different (or missing) facts. The
 * user's own row remains a fallback for installations that have not applied
 * the tenant-profile migration yet.
 */
export async function getOrgProfileForUser(supabase: SupabaseClient<Database>, userId: string) {
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
