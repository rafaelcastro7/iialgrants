/**
 * Giving History Tracker
 *
 * Tracks and analyzes historical grant-making patterns from funders.
 * Uses CRA T3010 data + Open Government datasets.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Get giving history for a specific funder
 */
export const getFunderGivingHistory = createServerFn({
  method: "GET",
  validator: z.object({
    funderId: z.string().uuid(),
    limit: z.number().min(1).max(100).default(50),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  // Get grants from this funder
  const { data: grants, error } = await supabase
    .from("grants")
    .select(
      `
        id, title, amount_min, amount_max, deadline, status,
        sectors, jurisdictions, description
      `,
    )
    .eq("funder_id", data.funderId)
    .order("deadline", { ascending: false })
    .limit(data.limit);

  if (error) throw new Error(`Failed to fetch giving history: ${error.message}`);

  // Calculate patterns
  const totalGrants = grants?.length || 0;
  const avgAmount =
    grants?.reduce((sum, g) => {
      const avg = ((g.amount_min || 0) + (g.amount_max || 0)) / 2;
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
});

/**
 * Analyze giving trends across all funders
 */
export const analyzeGivingTrends = createServerFn({
  method: "GET",
  validator: z.object({
    sector: z.string().optional(),
    province: z.string().optional(),
    years: z.number().min(1).max(10).default(3),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  // Get grants with funder info
  let query = supabase
    .from("grants")
    .select(
      `
        id, amount_min, amount_max, deadline, status, sectors,
        funder:funders!grants_funder_id_fkey(name, province, type)
      `,
    )
    .not("deadline", "is", null);

  if (data.sector) query = query.contains("sectors", [data.sector]);

  const { data: grants, error } = await query.limit(1000);

  if (error) throw new Error(`Failed to analyze trends: ${error.message}`);

  // Group by year
  const byYear: Record<string, { count: number; totalAmount: number }> = {};
  for (const grant of grants || []) {
    const year = new Date(grant.deadline).getFullYear().toString();
    if (!byYear[year]) byYear[year] = { count: 0, totalAmount: 0 };
    byYear[year].count++;
    byYear[year].totalAmount += ((grant.amount_min || 0) + (grant.amount_max || 0)) / 2;
  }

  return {
    trends: Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, data]) => ({
        year: Number(year),
        grantCount: data.count,
        totalFunding: Math.round(data.totalAmount),
        avgGrant: Math.round(data.totalAmount / (data.count || 1)),
      })),
    totalGrants: grants?.length || 0,
  };
});

/**
 * Predict funder likelihood based on historical patterns
 */
export const predictFunderLikelihood = createServerFn({
  method: "GET",
  validator: z.object({
    funderId: z.string().uuid(),
    orgSectors: z.array(z.string()),
    orgJurisdictions: z.array(z.string()),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  // Get funder's historical grants
  const { data: grants } = await supabase
    .from("grants")
    .select("sectors, jurisdictions, amount_min, amount_max, deadline")
    .eq("funder_id", data.funderId)
    .order("deadline", { ascending: false })
    .limit(50);

  if (!grants?.length) {
    return { likelihood: 0.3, confidence: "low", factors: [] };
  }

  // Calculate sector overlap
  const allSectors = grants.flatMap((g) => (Array.isArray(g.sectors) ? g.sectors : []));
  const sectorOverlap = data.orgSectors.filter((s) => allSectors.includes(s)).length;
  const sectorScore = sectorOverlap / (data.orgSectors.length || 1);

  // Calculate jurisdiction overlap
  const allJurisdictions = grants.flatMap((g) =>
    Array.isArray(g.jurisdictions) ? g.jurisdictions : [],
  );
  const jurisdictionOverlap = data.orgJurisdictions.filter((j) =>
    allJurisdictions.includes(j),
  ).length;
  const jurisdictionScore = jurisdictionOverlap / (data.orgJurisdictions.length || 1);

  // Calculate recency score
  const latestGrant = new Date(grants[0].deadline || Date.now());
  const monthsSinceLastGrant = (Date.now() - latestGrant.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const recencyScore = Math.max(0, 1 - monthsSinceLastGrant / 36);

  // Combined likelihood
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
});
