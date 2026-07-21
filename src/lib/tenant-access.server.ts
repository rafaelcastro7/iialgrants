"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const TENANT_ENTITY_TYPES = ["grant", "proposal", "submission", "funder"] as const;
export type TenantEntityType = (typeof TENANT_ENTITY_TYPES)[number];

type DbClient = SupabaseClient<Database>;

export type TenantPrincipal = {
  userId: string;
  orgId: string | null;
};

const ENTITY_TABLE = {
  funder: "funders",
  grant: "grants",
  proposal: "proposals",
  submission: "submissions",
} as const;

export async function getTenantPrincipal(
  supabase: DbClient,
  userId: string,
): Promise<TenantPrincipal> {
  const { data, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Tenant lookup failed: ${error.message}`);
  return { userId, orgId: data?.org_id ?? null };
}

export function tenantOwnsResource(
  principal: TenantPrincipal,
  resource: { org_id: string | null; user_id?: string | null },
  allowGlobal: boolean,
): boolean {
  if (resource.user_id === principal.userId) return true;
  if (resource.org_id && principal.orgId && resource.org_id === principal.orgId) return true;
  return allowGlobal && resource.org_id == null;
}

export async function assertEntityInUserOrg(
  supabase: DbClient,
  userId: string,
  entityType: TenantEntityType,
  entityId: string,
): Promise<{ orgId: string | null }> {
  const principal = await getTenantPrincipal(supabase, userId);
  const table = ENTITY_TABLE[entityType];
  const { data, error } = await supabase.from(table).select("*").eq("id", entityId).maybeSingle();

  if (error) throw new Error(`Resource lookup failed: ${error.message}`);
  if (!data) throw new Error("Resource not found");

  const resource = data as unknown as { org_id: string | null; user_id?: string | null };
  const allowGlobal = entityType === "grant" || entityType === "funder";
  if (!tenantOwnsResource(principal, resource, allowGlobal)) {
    throw new Error("Forbidden: resource belongs to another organization");
  }
  return { orgId: resource.org_id ?? null };
}

export async function assertUserInSameOrg(
  supabase: DbClient,
  userId: string,
  targetUserId: string,
): Promise<void> {
  if (userId === targetUserId) return;
  const principal = await getTenantPrincipal(supabase, userId);
  const target = await getTenantPrincipal(supabase, targetUserId);
  if (!principal.orgId || principal.orgId !== target.orgId) {
    throw new Error("Forbidden: assignee belongs to another organization");
  }
}

export async function filterEntityRowsForUser<T extends { entity_type: string; entity_id: string }>(
  supabase: DbClient,
  userId: string,
  rows: readonly T[],
): Promise<T[]> {
  const decisions = await Promise.all(
    rows.map(async (row) => {
      if (!TENANT_ENTITY_TYPES.includes(row.entity_type as TenantEntityType)) return false;
      try {
        await assertEntityInUserOrg(
          supabase,
          userId,
          row.entity_type as TenantEntityType,
          row.entity_id,
        );
        return true;
      } catch {
        return false;
      }
    }),
  );
  return rows.filter((_, index) => decisions[index]);
}

export async function assertComplianceItemInUserOrg(
  supabase: DbClient,
  userId: string,
  item: {
    submission_id: string | null;
    org_id: string | null;
    created_by: string | null;
  },
): Promise<void> {
  const principal = await getTenantPrincipal(supabase, userId);
  if (item.created_by === userId) return;
  if (item.org_id && principal.orgId && item.org_id === principal.orgId) return;
  if (item.submission_id) {
    await assertEntityInUserOrg(supabase, userId, "submission", item.submission_id);
    return;
  }
  throw new Error("Forbidden: compliance item belongs to another organization");
}
