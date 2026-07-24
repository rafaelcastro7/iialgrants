"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Platform Monitoring — Rate Limiting, Caching, Background Jobs
 *
 * Provides observability into platform infrastructure.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export const getRateLimitStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    try {
      const supabase = await createSupabaseAdmin();

      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent, error } = await supabase
        .from("webhook_rate_limit")
        .select("endpoint, client_ip, seen_at")
        .gte("seen_at", cutoff);

      if (error) return { endpoints: [], totalRequests: 0, uniqueIPs: 0 };

      const byEndpoint = new Map<string, number>();
      const ips = new Set<string>();
      for (const row of recent || []) {
        byEndpoint.set(row.endpoint, (byEndpoint.get(row.endpoint) || 0) + 1);
        if (row.client_ip) ips.add(row.client_ip);
      }

      return {
        endpoints: [...byEndpoint.entries()]
          .map(([endpoint, count]) => ({ endpoint, count }))
          .sort((a, b) => b.count - a.count),
        totalRequests: recent?.length || 0,
        uniqueIPs: ips.size,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getCacheStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    try {
      let embeddingStats: {
        totalEntries: number;
        validEntries: number;
        expiredEntries: number;
        ttlMs: number;
      } = { totalEntries: 0, validEntries: 0, expiredEntries: 0, ttlMs: 0 };
      try {
        const { getCacheStats: getEmbeddingCacheStats } =
          await import("@/lib/embeddings-cache.server");
        embeddingStats = getEmbeddingCacheStats();
      } catch {
        // Module not available
      }

      return {
        embeddings: embeddingStats,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

// getBackgroundJobsStatus was removed (2026-07-24) — its "Background Jobs"
// table and recent-runs KPI duplicated /ops (agent_runs daily breakdown +
// recent list) verbatim, just windowed differently (24h vs 30-day daily
// rows). /ops is the one page that owns per-agent run history; this file
// keeps only the monitoring data genuinely unique to it (rate limiting,
// embedding cache).
