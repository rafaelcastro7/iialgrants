"use server";

/**
 * Funder Intelligence Dashboard API
 *
 * Provides metrics and analytics for the funder database.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Get overall funder statistics
 */
export const getFunderDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    try {
      const supabase = context.supabase;

      // Total funders
      const { count: totalFunders, error: countError } = await supabase
        .from("funders")
        .select("*", { count: "exact", head: true });
      if (countError) throw new Error(countError.message);

      // By country — the only location field present on every funder
      const { data: countryData } = await supabase
        .from("funders")
        .select("country")
        .not("country", "is", null);

      const byCountry: Record<string, number> = {};
      for (const r of countryData || []) {
        if (r.country) byCountry[r.country] = (byCountry[r.country] || 0) + 1;
      }

      // By province
      const { data: provinceData } = await supabase
        .from("funders")
        .select("province")
        .not("province", "is", null);

      const byProvince: Record<string, number> = {};
      for (const r of provinceData || []) {
        byProvince[r.province] = (byProvince[r.province] || 0) + 1;
      }

      // By category
      const { data: typeData } = await supabase
        .from("funders")
        .select("category")
        .not("category", "is", null);

      const byType: Record<string, number> = {};
      for (const r of typeData || []) {
        if (r.category) byType[r.category] = (byType[r.category] || 0) + 1;
      }

      // By status
      const { data: statusData } = await supabase
        .from("funders")
        .select("charity_status")
        .not("charity_status", "is", null);

      const byStatus: Record<string, number> = {};
      for (const r of statusData || []) {
        if (r.charity_status) byStatus[r.charity_status] = (byStatus[r.charity_status] || 0) + 1;
      }

      // Revenue distribution
      const { data: revenueData } = await supabase
        .from("funders")
        .select("total_revenue")
        .not("total_revenue", "is", null);

      const revenues = (revenueData || [])
        .map((r) => r.total_revenue)
        .filter((r): r is number => r !== null)
        .sort((a, b) => a - b);

      const revenueStats = {
        median: revenues[Math.floor(revenues.length / 2)] || 0,
        mean: revenues.length ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0,
        p25: revenues[Math.floor(revenues.length * 0.25)] || 0,
        p75: revenues[Math.floor(revenues.length * 0.75)] || 0,
      };

      return {
        totalFunders: totalFunders || 0,
        byCountry,
        byProvince,
        byType,
        byStatus,
        revenueStats,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Get recent funder activity
 */
export const getRecentFunderActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      limit: z.number().min(1).max(50).default(10),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = context.supabase;

      // Recently updated funders
      const { data: recentFunders } = await supabase
        .from("funders")
        .select("id, name, category, country, jurisdiction, province, updated_at")
        .order("updated_at", { ascending: false })
        .limit(data.limit);

      // Recently added grants
      const { data: recentGrants } = await supabase
        .from("grants")
        .select(
          `
          id, title, amount_cad_min, amount_cad_max, deadline,
          funder:funders!grants_funder_id_fkey(name)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(data.limit);

      return {
        recentFunders: recentFunders || [],
        recentGrants: (recentGrants || []).map((g) => ({
          ...g,
          funder_name: Array.isArray(g.funder)
            ? g.funder[0]?.name
            : (g.funder as { name: string })?.name,
        })),
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

// getTopFunders was removed: listFunders (funder-search.functions.ts) supersedes
// it with real pagination, and its "grants" metric was a silent no-op — the
// switch case fell through without ordering, so asking for the top funders by
// grant count returned an arbitrary page.
