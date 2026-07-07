"use server";

/**
 * Funder Intelligence Dashboard API
 *
 * Provides metrics and analytics for the funder database.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Get overall funder statistics
 */
export const getFunderDashboardStats = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
    try {
      const supabase = await createSupabaseAdmin();

      // Total funders
      const { count: totalFunders } = await supabase
        .from("funders")
        .select("*", { count: "exact", head: true });

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
  .inputValidator(
    z.object({
      limit: z.number().min(1).max(50).default(10),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      // Recently updated funders
      const { data: recentFunders } = await supabase
        .from("funders")
        .select("id, name, category, province, updated_at")
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

/**
 * Get top funders by various metrics
 */
export const getTopFunders = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      metric: z.enum(["revenue", "grants", "recent"]),
      limit: z.number().min(1).max(20).default(10),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      let query = supabase
        .from("funders")
        .select("id, name, category, province, total_revenue, website");

      switch (data.metric) {
        case "revenue":
          query = query
            .not("total_revenue", "is", null)
            .order("total_revenue", { ascending: false });
          break;
        case "grants":
          break;
        case "recent":
          query = query.order("updated_at", { ascending: false });
          break;
      }

      const { data: funders } = await query.limit(data.limit);
      return funders || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
