/**
 * Grant Requirements Analyzer
 *
 * Extracts and surfaces what the grant REQUIRES from applicants.
 * NOT for blocking — for TRANSPARENCY.
 *
 * Examples:
 * - "Applicants must provide SIN" → flag it so org knows
 * - "Contact: jane@example.com" → surface the contact info
 * - "Annual revenue >= $500k required" → display requirement
 *
 * This is GRANT INFORMATION that must be fully visible to help org decide.
 */

import { detectStructuredData } from "@/lib/prompt-safety.server";

export type GrantRequirement = {
  category: "contact" | "credential" | "financial" | "legal" | "other";
  requirement: string; // Human-readable requirement
  value?: string; // Extracted value (email, phone, etc)
  isCritical: boolean; // True if deal-breaker for some orgs
};

/**
 * Analyze grant markdown for requirements that orgs need to know about.
 */
export function analyzeGrantRequirements(grantMarkdown: string): {
  requirements: GrantRequirement[];
  summary: string;
  hasContactInfo: boolean;
  requiresCredentialVerification: boolean;
} {
  const requirements: GrantRequirement[] = [];
  const structured = detectStructuredData(grantMarkdown);

  // Check for contact information
  if (structured.hasEmail) {
    const emailMatch = grantMarkdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/);
    requirements.push({
      category: "contact",
      requirement: "Grant contact information available",
      value: emailMatch?.[0],
      isCritical: false,
    });
  }

  if (structured.hasPhone) {
    const phoneMatch = grantMarkdown.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    requirements.push({
      category: "contact",
      requirement: "Grant contact phone available",
      value: phoneMatch?.[0],
      isCritical: false,
    });
  }

  // Check for credential requirements
  if (structured.hasSSN) {
    requirements.push({
      category: "credential",
      requirement: "Social Insurance Number (SIN) or equivalent required",
      isCritical: true,
    });
  }

  if (structured.requiresCreditCard) {
    requirements.push({
      category: "financial",
      requirement: "Credit card verification or payment method required",
      isCritical: false,
    });
  }

  // Check for financial/incorporation requirements
  if (/incorporated|corporation|not-for-profit|nonprofit/i.test(grantMarkdown)) {
    const type = grantMarkdown.match(/incorporated|corporation|not-for-profit|nonprofit/i)?.[0];
    requirements.push({
      category: "legal",
      requirement: `Must be registered as: ${type}`,
      isCritical: true,
    });
  }

  if (/revenue|budget|annual|fiscal/i.test(grantMarkdown)) {
    const revenueMatch = grantMarkdown.match(/\$?\d+[KMB]?\s*(thousand|million|billion)?/);
    if (revenueMatch) {
      requirements.push({
        category: "financial",
        requirement: "Financial documentation required",
        value: revenueMatch[0],
        isCritical: true,
      });
    }
  }

  // Generate summary
  const critical = requirements.filter((r) => r.isCritical).length;
  const summary =
    requirements.length === 0
      ? "No special requirements detected"
      : `${requirements.length} requirement(s) identified (${critical} critical)`;

  return {
    requirements,
    summary,
    hasContactInfo: structured.hasEmail || structured.hasPhone,
    requiresCredentialVerification: structured.hasSSN || structured.requiresCreditCard,
  };
}

/**
 * Format requirements for display in UI.
 */
export function formatGrantRequirements(analysis: ReturnType<typeof analyzeGrantRequirements>): string {
  if (analysis.requirements.length === 0) {
    return analysis.summary;
  }

  const lines: string[] = [analysis.summary];
  lines.push("");

  for (const req of analysis.requirements) {
    const icon = req.isCritical ? "🔴" : "ℹ️";
    const value = req.value ? ` (${req.value})` : "";
    lines.push(`${icon} ${req.requirement}${value}`);
  }

  if (analysis.hasContactInfo) {
    lines.push("");
    lines.push("✉️ You can contact the grantor directly for questions.");
  }

  return lines.join("\n");
}
