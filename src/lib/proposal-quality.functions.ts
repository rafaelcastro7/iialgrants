"use server";

/**
 * Proposal Quality Dashboard API
 *
 * Provides aggregate quality metrics across all proposals.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Get quality metrics for all proposals
 */
export const getProposalQualityMetrics = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  // Get all proposals with scores
  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("id, title, status, version, critic_score, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch proposals: ${error.message}`);

  const all = proposals || [];
  const scored = all.filter((p) => p.critic_score != null);
  const scores = scored.map((p) => Number(p.critic_score));

  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;

  // Score distribution
  const distribution = {
    excellent: scored.filter((p) => Number(p.critic_score) >= 0.8).length,
    good: scored.filter((p) => Number(p.critic_score) >= 0.6 && Number(p.critic_score) < 0.8)
      .length,
    fair: scored.filter((p) => Number(p.critic_score) >= 0.4 && Number(p.critic_score) < 0.6)
      .length,
    poor: scored.filter((p) => Number(p.critic_score) < 0.4).length,
  };

  // Status breakdown
  const byStatus: Record<string, number> = {};
  for (const p of all) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  }

  // Recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recent = all.filter((p) => new Date(p.updated_at) > thirtyDaysAgo);

  return {
    total: all.length,
    scored: scored.length,
    unscored: all.length - scored.length,
    avgScore: Math.round(avgScore * 100) / 100,
    minScore: Math.round(minScore * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    distribution,
    byStatus,
    recentCount: recent.length,
  };
});

/**
 * Get quality trends over time
 */
export const getQualityTrends = createServerFn({
  method: "GET",
  validator: z.object({
    days: z.number().min(7).max(365).default(30),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const since = new Date();
  since.setDate(since.getDate() - data.days);

  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("critic_score, created_at")
    .gte("created_at", since.toISOString())
    .not("critic_score", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch trends: ${error.message}`);

  // Group by week
  const weekly: Record<string, { count: number; totalScore: number }> = {};
  for (const p of proposals || []) {
    const d = new Date(p.created_at);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split("T")[0];
    if (!weekly[key]) weekly[key] = { count: 0, totalScore: 0 };
    weekly[key].count++;
    weekly[key].totalScore += Number(p.critic_score);
  }

  return Object.entries(weekly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      avgScore: Math.round((d.totalScore / d.count) * 100) / 100,
      count: d.count,
    }));
});
