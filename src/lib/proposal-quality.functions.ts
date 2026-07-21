"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Proposal Quality Dashboard API
 *
 * Provides aggregate quality metrics across all proposals.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getTenantPrincipal } from "./tenant-access.server";

/**
 * Get quality metrics for the caller's own org/proposals
 */
export const getProposalQualityMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);

      // Scope to the caller's own proposals (plus org-mates' if org-scoped).
      let query = supabase
        .from("proposals")
        .select("id, title, status, version, critic_score, created_at, updated_at, user_id, org_id")
        .order("updated_at", { ascending: false });
      query = principal.orgId
        ? query.or(`user_id.eq.${principal.userId},org_id.eq.${principal.orgId}`)
        : query.eq("user_id", principal.userId);

      const { data: proposals, error } = await query;

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
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Get quality trends over time
 */
export const getQualityTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      days: z.number().min(7).max(365).default(30),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);

      const since = new Date();
      since.setDate(since.getDate() - data.days);

      let query = supabase
        .from("proposals")
        .select("critic_score, created_at, user_id, org_id")
        .gte("created_at", since.toISOString())
        .not("critic_score", "is", null)
        .order("created_at", { ascending: true });
      query = principal.orgId
        ? query.or(`user_id.eq.${principal.userId},org_id.eq.${principal.orgId}`)
        : query.eq("user_id", principal.userId);

      const { data: proposals, error } = await query;

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
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
