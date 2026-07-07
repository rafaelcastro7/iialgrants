"use server";

/**
 * Funder Search API
 *
 * Full-text search and filtering for Canadian funders.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import { sanitizePgrstTerm } from "./search-sanitize";

/**
 * Search funders using full-text search + trigram similarity
 */
export const searchFunders = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      query: z.string().min(1).max(200),
      province: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      minRevenue: z.number().optional(),
      maxRevenue: z.number().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const term = sanitizePgrstTerm(data.query);

      let query = supabase
        .from("funders")
        .select(
          `id, name, designation, category, province, city, charity_status, total_revenue, website`,
        )
        .or(`name.ilike.%${term}%,legal_name.ilike.%${term}%,city.ilike.%${term}%`);

      if (data.province) query = query.eq("province", data.province);
      if (data.type) query = query.eq("category", data.type);
      if (data.status) query = query.eq("charity_status", data.status);
      if (data.minRevenue) query = query.gte("total_revenue", data.minRevenue);
      if (data.maxRevenue) query = query.lte("total_revenue", data.maxRevenue);

      query = query
        .order("name", { ascending: true })
        .range(data.offset, data.offset + data.limit - 1);

      const { data: results, error } = await query;
      if (error) throw new Error(`Search failed: ${error.message}`);

      const queryLower = data.query.toLowerCase();
      const scoredResults = (results || []).map((r) => {
        let relevance = 0;
        if (r.name?.toLowerCase().includes(queryLower)) relevance += 10;
        if (r.city?.toLowerCase().includes(queryLower)) relevance += 5;
        if (r.category?.toLowerCase().includes(queryLower)) relevance += 3;
        return { ...r, relevance };
      });

      scoredResults.sort((a, b) => b.relevance - a.relevance);
      return scoredResults;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Get funder suggestions for autocomplete
 */
export const suggestFunders = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      query: z.string().min(2).max(100),
      limit: z.number().min(1).max(20).default(10),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: results } = await supabase
        .from("funders")
        .select("id, name, category, province, city")
        .ilike("name", `%${data.query}%`)
        .limit(data.limit);

      return results || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Get funder statistics
 */
export const getFunderStats = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: byProvince } = await supabase
        .from("funders")
        .select("province")
        .not("province", "is", null);

      const provinceCounts: Record<string, number> = {};
      for (const r of byProvince || []) {
        if (r.province) provinceCounts[r.province] = (provinceCounts[r.province] || 0) + 1;
      }

      const { data: byType } = await supabase
        .from("funders")
        .select("category")
        .not("category", "is", null);

      const typeCounts: Record<string, number> = {};
      for (const r of byType || []) {
        if (r.category) typeCounts[r.category] = (typeCounts[r.category] || 0) + 1;
      }

      const { count: total } = await supabase
        .from("funders")
        .select("*", { count: "exact", head: true });

      return {
        total: total || 0,
        byProvince: provinceCounts,
        byType: typeCounts,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
