// Admin console for the discovery/search configuration knobs — the
// grant-search analog of fit-rules.functions.ts, but for platform-wide
// discovery behavior rather than per-org screening.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export const getDiscoveryConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    // discovery_config isn't in the generated types yet — cast through any
    // (same pattern used for crawl_ledger reads elsewhere in this codebase).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("discovery_config")
      .select("*")
      .eq("is_singleton", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

const RegexPattern = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => {
    try {
      new RegExp(s);
      return true;
    } catch {
      return false;
    }
  }, "Invalid regular expression");

const RssFeed = z.object({
  key: z.string().min(1).max(60),
  url: z.string().url(),
  defaultAgency: z.string().max(200).optional(),
});

const UpdateInput = z
  .object({
    maxPagesPerRun: z.number().int().min(1).max(100),
    scrapeConcurrency: z.number().int().min(1).max(20),
    fallbackMaxLinks: z.number().int().min(1).max(100),
    firecrawlSearchQuery: z.string().min(1).max(300),
    extraNonGrantUrlPatterns: z.array(RegexPattern).max(100),
    extraRootIndexPaths: z.array(z.string().min(1).max(120)).max(100),
    extraProgramHintKeywords: z.array(z.string().min(1).max(60)).max(200),
    extraNonProgramKeywords: z.array(z.string().min(1).max(60)).max(200),
    funderScoutQueries: z.array(z.string().min(1).max(300)).max(50),
    extraRssFeeds: z.array(RssFeed).max(50),
    candidateAutoApproveThreshold: z.number().int().min(0).max(100),
    candidateReviewMinThreshold: z.number().int().min(0).max(100),
  })
  .refine((d) => d.candidateReviewMinThreshold <= d.candidateAutoApproveThreshold, {
    message: "review_threshold_must_be_at_or_below_auto_approve",
    path: ["candidateReviewMinThreshold"],
  });

export const updateDiscoveryConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb
      .from("discovery_config")
      .update({
        max_pages_per_run: data.maxPagesPerRun,
        scrape_concurrency: data.scrapeConcurrency,
        fallback_max_links: data.fallbackMaxLinks,
        firecrawl_search_query: data.firecrawlSearchQuery,
        extra_non_grant_url_patterns: data.extraNonGrantUrlPatterns,
        extra_root_index_paths: data.extraRootIndexPaths,
        extra_program_hint_keywords: data.extraProgramHintKeywords,
        extra_non_program_keywords: data.extraNonProgramKeywords,
        funder_scout_queries: data.funderScoutQueries,
        extra_rss_feeds: data.extraRssFeeds,
        candidate_auto_approve_threshold: data.candidateAutoApproveThreshold,
        candidate_review_min_threshold: data.candidateReviewMinThreshold,
        updated_by: context.userId,
      })
      .eq("is_singleton", true);
    if (error) throw error;
    const { clearDiscoveryConfigCache } = await import("@/lib/discovery-config.server");
    clearDiscoveryConfigCache();
    return { ok: true };
  });
