"use server";

/**
 * Funder Search API
 *
 * Full-text search and filtering for funders across the Americas.
 *
 * Reads run through the caller's authenticated client (RLS), not the service
 * role: the funder directory is user-facing reference data, so there is no
 * reason to bypass row-level security for it — and doing so made the whole
 * module silently render "0 funders" whenever the service key was unset or
 * stale, because the admin client 401s and the count coalesced to 0.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizePgrstTerm } from "./search-sanitize";

/**
 * Search funders using full-text search + trigram similarity
 */
export const searchFunders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      query: z.string().min(1).max(200),
      country: z.string().optional(),
      province: z.string().optional(),
      jurisdiction: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      minRevenue: z.number().optional(),
      maxRevenue: z.number().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = context.supabase;
      const term = sanitizePgrstTerm(data.query);

      // Rank across the FULL matching set first (indexed FTS-style trigram +
      // exact-match blend, same shape as search_grant_catalog), then apply
      // filters and pagination on the ranked set. The previous version
      // paginated an ilike-filtered, name-ordered query and only re-sorted
      // within that one page — a highly relevant funder past the page
      // window was silently dropped from results, not just ranked lower.
      const { data: ranked, error: rankError } = await supabase.rpc("search_funder_catalog", {
        search_query: term,
        result_limit: 500,
      });
      if (rankError) throw new Error(`Search failed: ${rankError.message}`);
      const rankById = new Map<string, { relevance: number; matched_on: string }>();
      for (const row of ranked ?? []) {
        rankById.set(row.funder_id, { relevance: row.relevance, matched_on: row.matched_on });
      }
      if (rankById.size === 0) return [];

      let query = supabase
        .from("funders")
        .select(
          `id, name, designation, category, country, jurisdiction, province, city, charity_status, total_revenue, disbursed_annual, website`,
        )
        .in("id", [...rankById.keys()]);

      if (data.country) query = query.eq("country", data.country);
      if (data.jurisdiction) query = query.eq("jurisdiction", data.jurisdiction);
      if (data.province) query = query.eq("province", data.province);
      if (data.type) query = query.eq("category", data.type);
      if (data.status) query = query.eq("charity_status", data.status);
      if (data.minRevenue) query = query.gte("total_revenue", data.minRevenue);
      if (data.maxRevenue) query = query.lte("total_revenue", data.maxRevenue);

      const { data: results, error } = await query;
      if (error) throw new Error(`Search failed: ${error.message}`);

      const scoredResults = (results || [])
        .map((r) => ({
          ...r,
          relevance: rankById.get(r.id)?.relevance ?? 0,
          matchedOn: rankById.get(r.id)?.matched_on ?? null,
        }))
        .sort((a, b) => b.relevance - a.relevance);

      return scoredResults.slice(data.offset, data.offset + data.limit);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Browse the full funder directory, page by page.
 *
 * The directory section previously rendered getTopFunders(limit: 12), whose
 * validator caps at 20 — so with a 699-funder catalog the page could never
 * show more than a sliver of it, with no way to reach the rest.
 */
export const listFunders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      country: z.string().trim().min(2).max(8).optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    }),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("funders")
      .select(
        "id, name, category, country, jurisdiction, province, city, charity_status, total_revenue, disbursed_annual, website",
        { count: "exact" },
      );
    if (data.country) query = query.eq("country", data.country);

    const {
      data: rows,
      error,
      count,
    } = await query
      // Alphabetical inside the selected country. Canada-first is expressed by
      // the UI defaulting the country filter to CA rather than by sort order:
      // ordering on the country column would put AR/BR/CL/CO ahead of CA, and
      // PostgREST cannot order by a CASE expression.
      .order("name", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    // Attach how many live opportunities each funder actually has. 83 of the
    // 699 funders (Gates, IDB, CONACYT, FAPESP and the rest of the manually
    // seeded directory) have none, so search can never surface them — without
    // this the directory renders them identically to a funder with 40 open
    // calls.
    const ids = (rows ?? []).map((f) => f.id);
    const openByFunder = new Map<string, number>();
    if (ids.length) {
      const { data: grantRows, error: grantError } = await context.supabase
        .from("grants")
        .select("funder_id")
        .in("funder_id", ids)
        .not("status", "in", "(archived,expired,lost)");
      if (grantError) throw new Error(grantError.message);
      for (const row of grantRows ?? []) {
        openByFunder.set(row.funder_id, (openByFunder.get(row.funder_id) ?? 0) + 1);
      }
    }

    return {
      funders: (rows ?? []).map((f) => ({ ...f, openGrants: openByFunder.get(f.id) ?? 0 })),
      total: count ?? 0,
    };
  });

/**
 * Get funder suggestions for autocomplete
 */
export const suggestFunders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      query: z.string().min(2).max(100),
      limit: z.number().min(1).max(20).default(10),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = context.supabase;

      const { data: results } = await supabase
        .from("funders")
        .select("id, name, category, country, jurisdiction, province, city")
        .ilike("name", `%${data.query}%`)
        .limit(data.limit);

      return results || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

// getFunderStats was removed: it duplicated getFunderDashboardStats
// (funder-dashboard.functions.ts), which is what the /funders page actually
// renders. Two functions computing the same breakdown drift apart in practice.
