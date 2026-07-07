"use server";

/**
 * Giving History Tracker
 *
 * Tracks and analyzes historical grant-making patterns from funders.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Get giving history for a specific funder
 */
export const getFunderGivingHistory = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      funderId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(50),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: grants, error } = await supabase
        .from("grants")
        .select(`id, title, amount_cad_min, amount_cad_max, deadline, status, sectors, summary`)
        .eq("funder_id", data.funderId)
        .order("deadline", { ascending: false })
        .limit(data.limit);

      if (error) throw new Error(`Failed to fetch giving history: ${error.message}`);

      const totalGrants = grants?.length || 0;
      const avgAmount =
        grants?.reduce((sum, g) => {
          const avg = ((g.amount_cad_min || 0) + (g.amount_cad_max || 0)) / 2;
          return sum + avg;
        }, 0) / (totalGrants || 1);

      const sectors: Record<string, number> = {};
      for (const grant of grants || []) {
        if (grant.sectors) {
          const sectorList = Array.isArray(grant.sectors) ? grant.sectors : [grant.sectors];
          for (const s of sectorList) {
            sectors[s] = (sectors[s] || 0) + 1;
          }
        }
      }

      return {
        grants: grants || [],
        patterns: {
          totalGrants,
          avgAmount: Math.round(avgAmount),
          topSectors: Object.entries(sectors)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([sector, count]) => ({ sector, count })),
        },
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Analyze giving trends across all funders
 */
export const analyzeGivingTrends = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      sector: z.string().optional(),
      province: z.string().optional(),
      years: z.number().min(1).max(10).default(3),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      let query = supabase
        .from("grants")
        .select(
          `id, amount_cad_min, amount_cad_max, deadline, status, sectors, funder:funders!grants_funder_id_fkey(name, province, category)`,
        )
        .not("deadline", "is", null);

      if (data.sector) query = query.contains("sectors", [data.sector]);

      const { data: grants, error } = await query.limit(1000);
      if (error) throw new Error(`Failed to analyze trends: ${error.message}`);

      const byYear: Record<string, { count: number; totalAmount: number }> = {};
      for (const grant of grants || []) {
        if (!grant.deadline) continue;
        const year = new Date(grant.deadline).getFullYear().toString();
        if (!byYear[year]) byYear[year] = { count: 0, totalAmount: 0 };
        byYear[year].count++;
        byYear[year].totalAmount += ((grant.amount_cad_min || 0) + (grant.amount_cad_max || 0)) / 2;
      }

      return {
        trends: Object.entries(byYear)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([year, d]) => ({
            year: Number(year),
            grantCount: d.count,
            totalFunding: Math.round(d.totalAmount),
            avgGrant: Math.round(d.totalAmount / (d.count || 1)),
          })),
        totalGrants: grants?.length || 0,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Predict funder likelihood based on historical patterns
 */
export const predictFunderLikelihood = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      funderId: z.string().uuid(),
      orgSectors: z.array(z.string()),
      orgJurisdictions: z.array(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: grants } = await supabase
        .from("grants")
        .select("sectors, amount_cad_min, amount_cad_max, deadline")
        .eq("funder_id", data.funderId)
        .order("deadline", { ascending: false })
        .limit(50);

      if (!grants?.length) {
        return { likelihood: 0.3, confidence: "low", factors: [] };
      }

      const allSectors = grants.flatMap((g) => (Array.isArray(g.sectors) ? g.sectors : []));
      const sectorOverlap = data.orgSectors.filter((s) => allSectors.includes(s)).length;
      const sectorScore = sectorOverlap / (data.orgSectors.length || 1);

      // Geographic match: the funder's jurisdiction against the org's jurisdictions.
      const { data: funder } = await supabase
        .from("funders")
        .select("province, jurisdiction")
        .eq("id", data.funderId)
        .single();
      const funderRegions = [funder?.province, funder?.jurisdiction].filter(Boolean) as string[];
      const jurisdictionScore = data.orgJurisdictions.some((j) => funderRegions.includes(j))
        ? 1
        : 0;

      const latestGrant = new Date(grants[0].deadline || Date.now());
      const monthsSinceLastGrant =
        (Date.now() - latestGrant.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const recencyScore = Math.max(0, 1 - monthsSinceLastGrant / 36);

      const likelihood = Math.min(
        1,
        sectorScore * 0.4 + jurisdictionScore * 0.3 + recencyScore * 0.3 + 0.2,
      );

      const factors = [];
      if (sectorScore > 0.5) factors.push("Strong sector alignment");
      if (jurisdictionScore > 0.5) factors.push("Geographic match");
      if (recencyScore > 0.7) factors.push("Active recent giving");
      if (grants.length > 10) factors.push("High-volume funder");

      return {
        likelihood: Math.round(likelihood * 100) / 100,
        confidence: grants.length > 20 ? "high" : grants.length > 5 ? "medium" : "low",
        factors,
        historicalGrants: grants.length,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
