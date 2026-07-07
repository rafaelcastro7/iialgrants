"use server";

/**
 * Funder Enrichment Service
 *
 * Enriches funder profiles with additional data from:
 * - Website scraping (mission, focus areas)
 * - CRA T3010 financial data
 * - Historical giving patterns
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";

type FunderUpdate = Database["public"]["Tables"]["funders"]["Update"];

/**
 * Extract mission statement and focus areas from funder website
 */
async function scrapeFunderWebsite(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "IIAL-GrantIntelligence/1.0 (research)" },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();

    const metaDescMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    );
    const ogDescMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    );
    const mission = metaDescMatch?.[1] || ogDescMatch?.[1] || null;

    const socialMedia: Record<string, string> = {};
    const socialPatterns = [
      { name: "linkedin", pattern: /linkedin\.com\/(?:company|org)\/([^"'\s/]+)/i },
      { name: "twitter", pattern: /(?:twitter|x)\.com\/([^"'\s/]+)/i },
      { name: "facebook", pattern: /facebook\.com\/([^"'\s/]+)/i },
      { name: "instagram", pattern: /instagram\.com\/([^"'\s/]+)/i },
    ];

    for (const { name, pattern } of socialPatterns) {
      const match = html.match(pattern);
      if (match) socialMedia[name] = match[1];
    }

    const focusKeywords = [
      "education",
      "health",
      "environment",
      "social",
      "community",
      "youth",
      "elderly",
      "arts",
      "culture",
      "science",
      "research",
      "indigenous",
      "immigration",
      "housing",
      "poverty",
      "hunger",
    ];

    const htmlLower = html.toLowerCase();
    const focusAreas = focusKeywords.filter((kw) => htmlLower.includes(kw));

    return {
      mission_statement: mission?.slice(0, 1000) || null,
      focus_areas: focusAreas.slice(0, 10),
      geographic_focus: null,
      employee_count: null,
      founding_year: null,
      social_media: socialMedia,
    };
  } catch {
    return null;
  }
}

/**
 * Main enrichment function
 */
export const enrichFunder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      funderId: z.string().uuid(),
      website: z.string().url().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: funder, error: fetchError } = await supabase
        .from("funders")
        .select("*")
        .eq("id", data.funderId)
        .single();

      if (fetchError || !funder) {
        return { success: false, error: "Funder not found" };
      }

      let websiteData = null;
      if (funder.website || data.website) {
        websiteData = await scrapeFunderWebsite(funder.website || data.website!);
      }

      const updates: FunderUpdate = {
        updated_at: new Date().toISOString(),
      };

      if (websiteData) {
        // funders has no dedicated mission/focus/social columns, so the scraped
        // enrichment is persisted into the flexible charitable_programs JSON blob.
        const existing =
          funder.charitable_programs && typeof funder.charitable_programs === "object"
            ? (funder.charitable_programs as Record<string, unknown>)
            : {};
        const enrichment: Record<string, unknown> = {};
        if (websiteData.mission_statement)
          enrichment.mission_statement = websiteData.mission_statement;
        if (websiteData.focus_areas.length > 0) enrichment.focus_areas = websiteData.focus_areas;
        if (Object.keys(websiteData.social_media).length > 0)
          enrichment.social_media = websiteData.social_media;
        if (Object.keys(enrichment).length > 0) {
          updates.charitable_programs = { ...existing, ...enrichment } as Json;
        }
      }

      const { error: updateError } = await supabase
        .from("funders")
        .update(updates)
        .eq("id", data.funderId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true, data: websiteData };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

/**
 * Batch enrich multiple funders
 */
export const batchEnrichFunders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      funderIds: z.array(z.string().uuid()).max(50),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const results = [];
      for (const funderId of data.funderIds) {
        const result = await enrichFunder({ data: { funderId } });
        results.push({ funderId, ...result });
      }
      return results;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
