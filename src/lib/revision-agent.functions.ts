"use server";

/**
 * Revision Agent
 *
 * Analyzes review findings and generates actionable revision suggestions.
 * Groups findings by section, prioritizes by severity, suggests concrete fixes.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, suggestion: 3 } as const;

export const getRevisionPlan = createServerFn({
  method: "GET",
  validator: z.object({
    proposalId: z.string().uuid(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: reviews, error } = await supabase
    .from("proposal_reviews")
    .select("id, reviewer, score, findings, created_at")
    .eq("proposal_id", data.proposalId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
  if (!reviews || reviews.length === 0) {
    return { sections: [], totalFindings: 0, criticalCount: 0, priority: "none" as const };
  }

  const allFindings: Array<{
    reviewer: string;
    severity: string;
    section: string;
    issue: string;
    suggestion: string;
    quote?: string;
  }> = [];

  for (const review of reviews) {
    if (Array.isArray(review.findings)) {
      for (const f of review.findings) {
        allFindings.push({ reviewer: review.reviewer, ...f });
      }
    }
  }

  const bySection = new Map<
    string,
    {
      findings: typeof allFindings;
      critical: number;
      major: number;
      minor: number;
      suggestions: number;
    }
  >();

  for (const f of allFindings) {
    const section = f.section || "General";
    const existing = bySection.get(section) || {
      findings: [],
      critical: 0,
      major: 0,
      minor: 0,
      suggestions: 0,
    };
    existing.findings.push(f);
    if (f.severity === "critical") existing.critical++;
    else if (f.severity === "major") existing.major++;
    else if (f.severity === "minor") existing.minor++;
    else existing.suggestions++;
    bySection.set(section, existing);
  }

  const sections = [...bySection.entries()]
    .map(([name, stats]) => ({
      name,
      findings: stats.findings.sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 4) -
          (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 4),
      ),
      critical: stats.critical,
      major: stats.major,
      minor: stats.minor,
      suggestions: stats.suggestions,
      priority:
        stats.critical > 0
          ? ("urgent" as const)
          : stats.major > 0
            ? ("high" as const)
            : ("normal" as const),
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return b.critical + b.major - (a.critical + a.major);
    });

  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const priority =
    criticalCount > 0
      ? ("urgent" as const)
      : allFindings.length > 5
        ? ("high" as const)
        : ("normal" as const);

  return {
    sections,
    totalFindings: allFindings.length,
    criticalCount,
    majorCount: allFindings.filter((f) => f.severity === "major").length,
    priority,
    reviewersConsulted: [...new Set(reviews.map((r) => r.reviewer))],
  };
});
