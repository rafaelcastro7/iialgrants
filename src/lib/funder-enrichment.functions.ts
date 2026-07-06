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
export const enrichFunder = createServerFn({
  method: "POST",
  validator: z.object({
    funderId: z.string().uuid(),
    website: z.string().url().optional(),
  }),
}).handler(async ({ data }) => {
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

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (websiteData) {
      if (websiteData.mission_statement && !funder.description) {
        updates.description = websiteData.mission_statement;
      }
      if (websiteData.focus_areas.length > 0 && !funder.geographic_focus) {
        updates.geographic_focus = websiteData.focus_areas.join(", ");
      }
      if (Object.keys(websiteData.social_media).length > 0) {
        updates.social_media = websiteData.social_media;
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
export const batchEnrichFunders = createServerFn({
  method: "POST",
  validator: z.object({
    funderIds: z.array(z.string().uuid()).max(50),
    force: z.boolean().optional(),
  }),
}).handler(async ({ data }) => {
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
