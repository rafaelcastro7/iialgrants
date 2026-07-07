"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Citation Tracker
 *
 * Tracks and validates citations in proposals.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const extractCitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      proposalId: z.string().uuid(),
      sections: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          content: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const allCitations: Array<{
        id: string;
        proposalSectionId: string;
        source: string;
        verified: boolean;
        retracted: boolean;
        inlineRef: string;
        selfCitation: boolean;
      }> = [];

      for (const section of data.sections) {
        const inlinePattern =
          /\(([A-Z][a-z]+(?:\s*(?:&|and)\s*[A-Z][a-z]+)*,?\s*\d{4}(?:[a-z])?)\)/g;
        let match;
        const sectionCitations: string[] = [];

        while ((match = inlinePattern.exec(section.content)) !== null) {
          sectionCitations.push(match[1]);
        }

        sectionCitations.forEach((ref, i) => {
          allCitations.push({
            id: `${section.id}-cit-${i}`,
            proposalSectionId: section.id,
            source: "user_added",
            verified: false,
            retracted: false,
            inlineRef: ref,
            selfCitation:
              ref.toLowerCase().includes("iial") || ref.toLowerCase().includes("institute"),
          });
        });
      }

      const summary = {
        totalCitations: allCitations.length,
        verified: allCitations.filter((c) => c.verified).length,
        unverified: allCitations.filter((c) => !c.verified).length,
        retracted: allCitations.filter((c) => c.retracted).length,
        selfCitationCount: allCitations.filter((c) => c.selfCitation).length,
        selfCitationRatio: allCitations.length
          ? allCitations.filter((c) => c.selfCitation).length / allCitations.length
          : 0,
        bySection: {} as Record<string, number>,
        bySource: {} as Record<string, number>,
      };

      for (const cit of allCitations) {
        const section = data.sections.find((s) => s.id === cit.proposalSectionId);
        if (section) {
          summary.bySection[section.title] = (summary.bySection[section.title] || 0) + 1;
        }
        summary.bySource[cit.source] = (summary.bySource[cit.source] || 0) + 1;
      }

      const { error } = await supabase.from("proposal_citation_reports").upsert(
        {
          proposal_id: data.proposalId,
          citations: allCitations,
          summary,
          created_at: new Date().toISOString(),
        },
        { onConflict: "proposal_id" },
      );

      if (error) throw new Error("Failed to store citations: " + error.message);

      return { citations: allCitations, summary };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const validateCitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      doi: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`https://api.crossref.org/works/${data.doi}`, {
        headers: { "User-Agent": "IIAL-GrantIntelligence/1.0" },
      });

      if (!res.ok) return { valid: false, error: "DOI not found" };

      const work = await res.json();
      const item = work.message;

      return {
        valid: true,
        title: item.title?.[0] || "",
        authors:
          item.author?.map((a: { given?: string; family?: string }) =>
            `${a.given || ""} ${a.family || ""}`.trim(),
          ) || [],
        year: item.published?.["date-parts"]?.[0]?.[0] || item.created?.["date-parts"]?.[0]?.[0],
        journal: item["container-title"]?.[0] || "",
        retracted: item.type === "retraction",
      };
    } catch {
      return { valid: false, error: "Validation failed" };
    }
  });

export const getCitationSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      proposalId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: record, error } = await supabase
        .from("proposal_citation_reports")
        .select("citations, summary")
        .eq("proposal_id", data.proposalId)
        .single();

      if (error) return { citations: [], summary: null };
      return record;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
