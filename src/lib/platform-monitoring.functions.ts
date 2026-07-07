"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Platform Monitoring — Rate Limiting, Caching, Background Jobs
 *
 * Provides observability into platform infrastructure.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getRateLimitStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
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
  .inputValidator(z.object({}))
  .handler(async () => {
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

export const getBackgroundJobsStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: runs } = await supabase
        .from("agent_runs")
        .select("agent, status, created_at, latency_ms")
        .order("created_at", { ascending: false })
        .limit(50);

      const byAgent = new Map<string, { running: number; completed: number; failed: number }>();
      for (const run of runs || []) {
        const agent = run.agent || "unknown";
        const existing = byAgent.get(agent) || { running: 0, completed: 0, failed: 0 };
        if (run.status === "running") existing.running++;
        else if (run.status === "succeeded") existing.completed++;
        else if (run.status === "failed") existing.failed++;
        byAgent.set(agent, existing);
      }

      return {
        agents: [...byAgent.entries()].map(([agent, stats]) => ({ agent, ...stats })),
        recentRuns: (runs || []).slice(0, 10),
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
