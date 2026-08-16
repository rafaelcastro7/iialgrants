// Admin-configurable discovery/search knobs, with hardcoded fallbacks.
//
// A missing discovery_config row, an RLS hiccup, or an admin-saved bad regex
// must never break live discovery — every field degrades to the exact value
// that used to be a hardcoded constant before this config table existed.

export type DiscoveryConfig = {
  maxPagesPerRun: number;
  scrapeConcurrency: number;
  fallbackMaxLinks: number;
  firecrawlSearchQuery: string;
  extraNonGrantUrlPatterns: RegExp[];
  extraRootIndexPaths: string[];
  extraProgramHintKeywords: string[];
  extraNonProgramKeywords: string[];
  funderScoutQueries: string[];
  extraRssFeeds: Array<{ key: string; url: string; defaultAgency?: string }>;
  candidateAutoApproveThreshold: number;
  candidateReviewMinThreshold: number;
};

export const DISCOVERY_CONFIG_DEFAULTS: DiscoveryConfig = {
  maxPagesPerRun: 15,
  scrapeConcurrency: 3,
  fallbackMaxLinks: 12,
  firecrawlSearchQuery: "program funding grant subvention financement",
  extraNonGrantUrlPatterns: [],
  extraRootIndexPaths: [],
  extraProgramHintKeywords: [],
  extraNonProgramKeywords: [],
  funderScoutQueries: [],
  extraRssFeeds: [],
  candidateAutoApproveThreshold: 80,
  candidateReviewMinThreshold: 40,
};

// Compiles an admin-entered pattern string to a case-insensitive RegExp,
// dropping (never throwing on) anything invalid — a bad pattern saved
// through the admin UI degrades to "ignored", it must never take discovery
// down. updateDiscoveryConfig() also validates at write time; this is the
// defense-in-depth read-time backstop.
function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function asPositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
}

let cache: { value: DiscoveryConfig; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function resolveDiscoveryConfig(): Promise<DiscoveryConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // discovery_config isn't in the generated types yet — cast through any,
    // same pattern already used for crawl_ledger reads elsewhere in this
    // codebase (src/lib/crawl-ledger.server.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data, error } = await sb
      .from("discovery_config")
      .select("*")
      .eq("is_singleton", true)
      .maybeSingle();
    if (error || !data) {
      cache = { value: DISCOVERY_CONFIG_DEFAULTS, at: Date.now() };
      return DISCOVERY_CONFIG_DEFAULTS;
    }
    const row = data as Record<string, unknown>;
    const value: DiscoveryConfig = {
      maxPagesPerRun: asPositiveInt(
        row.max_pages_per_run,
        DISCOVERY_CONFIG_DEFAULTS.maxPagesPerRun,
      ),
      scrapeConcurrency: asPositiveInt(
        row.scrape_concurrency,
        DISCOVERY_CONFIG_DEFAULTS.scrapeConcurrency,
      ),
      fallbackMaxLinks: asPositiveInt(
        row.fallback_max_links,
        DISCOVERY_CONFIG_DEFAULTS.fallbackMaxLinks,
      ),
      firecrawlSearchQuery:
        typeof row.firecrawl_search_query === "string" && row.firecrawl_search_query.trim()
          ? row.firecrawl_search_query
          : DISCOVERY_CONFIG_DEFAULTS.firecrawlSearchQuery,
      extraNonGrantUrlPatterns: asStringArray(row.extra_non_grant_url_patterns)
        .map(safeRegex)
        .filter((re): re is RegExp => re !== null),
      extraRootIndexPaths: asStringArray(row.extra_root_index_paths),
      extraProgramHintKeywords: asStringArray(row.extra_program_hint_keywords),
      extraNonProgramKeywords: asStringArray(row.extra_non_program_keywords),
      funderScoutQueries: asStringArray(row.funder_scout_queries),
      extraRssFeeds: Array.isArray(row.extra_rss_feeds)
        ? (row.extra_rss_feeds as Array<Record<string, unknown>>)
            .filter((f) => typeof f.key === "string" && typeof f.url === "string")
            .map((f) => ({
              key: f.key as string,
              url: f.url as string,
              defaultAgency: typeof f.defaultAgency === "string" ? f.defaultAgency : undefined,
            }))
        : [],
      candidateAutoApproveThreshold: asPositiveInt(
        row.candidate_auto_approve_threshold,
        DISCOVERY_CONFIG_DEFAULTS.candidateAutoApproveThreshold,
      ),
      candidateReviewMinThreshold: asPositiveInt(
        row.candidate_review_min_threshold,
        DISCOVERY_CONFIG_DEFAULTS.candidateReviewMinThreshold,
      ),
    };
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return DISCOVERY_CONFIG_DEFAULTS;
  }
}

// Called right after an admin saves changes so the very next discovery run
// in this server process sees them immediately instead of up to 60s later.
export function clearDiscoveryConfigCache(): void {
  cache = null;
}
