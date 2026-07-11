/**
 * Grant Requirements Analyzer
 *
 * Extracts and surfaces what the grant requires from applicants.
 * This is for transparency, not for blocking.
 *
 * Examples:
 * - "Applicants must provide SIN" -> flag it so the organization knows.
 * - "Contact: jane@example.com" -> surface the contact info.
 * - "Annual revenue >= $500k required" -> display the requirement.
 *
 * This is grant information that must remain visible to help users decide.
 */

import { detectStructuredData } from "@/lib/prompt-safety.server";

export type GrantRequirement = {
  category: "contact" | "credential" | "financial" | "legal" | "document" | "process" | "other";
  requirement: string;
  value?: string;
  isCritical: boolean;
};

type RequirementPattern = {
  re: RegExp;
  requirement: string;
  isCritical: boolean;
};

// RFP-style application artifacts funders commonly demand. Each matched snippet
// becomes the requirement value so users can verify the source phrase.
const DOCUMENT_PATTERNS: RequirementPattern[] = [
  {
    re: /\b(?:audited\s+)?financial\s+statements?\b|\betats?\s+financiers?\b|\bétats?\s+financiers?\b/i,
    requirement: "Financial statements required",
    isCritical: true,
  },
  {
    re: /\bletters?\s+of\s+(?:support|intent|reference)\b|\blettres?\s+(?:d['’]appui|d['’]intention)\b/i,
    requirement: "Letter(s) of support / intent required",
    isCritical: false,
  },
  {
    re: /\b(?:detailed\s+(?:project\s+)?budget|project\s+budget|budget\s+(?:template|breakdown|form|proposal))\b|\bbudget\s+detaille\b|\bbudget\s+détaillé\b/i,
    requirement: "Detailed project budget required",
    isCritical: true,
  },
  {
    re: /\b(?:certificate|articles?)\s+of\s+incorporation\b|\bcertificat\s+de\s+constitution\b|\bregistration\s+number\b/i,
    requirement: "Proof of incorporation / registration required",
    isCritical: true,
  },
  {
    re: /\bwork\s*plan\b|\bproject\s+plan\b|\bplan\s+de\s+travail\b/i,
    requirement: "Work plan / project plan required",
    isCritical: false,
  },
  {
    re: /\b(?:most\s+recent\s+)?annual\s+report\b|\brapport\s+annuel\b/i,
    requirement: "Annual report required",
    isCritical: false,
  },
  {
    re: /\bboard\s+(?:of\s+directors\s+)?(?:list|resolution|approval)\b|\bresolution\s+du\s+conseil\b|\brésolution\s+du\s+conseil\b/i,
    requirement: "Board list / resolution required",
    isCritical: false,
  },
  {
    re: /\binsurance\s+(?:certificate|proof|coverage)\b|\bpreuve\s+d['’]assurance\b/i,
    requirement: "Proof of insurance required",
    isCritical: false,
  },
];

const PROCESS_PATTERNS: RequirementPattern[] = [
  {
    re: /\bletter\s+of\s+intent\s+(?:is\s+)?(?:required|must\s+be\s+submitted)\b|\btwo[- ]stage\s+(?:application|process)\b|\bpre[- ]?(?:application|proposal|screening)\b/i,
    requirement: "Two-stage process (pre-application / LOI first)",
    isCritical: true,
  },
  {
    re: /\bonline\s+(?:application\s+)?portal\b|\bapply\s+(?:online|through\s+the\s+portal)\b|\bportail\s+en\s+ligne\b/i,
    requirement: "Submission via online portal",
    isCritical: false,
  },
  {
    re: /\bmatching\s+(?:funds?|contribution)\b|\bcost[- ]shar(?:e|ing)\b|\bcontribution\s+de\s+contrepartie\b/i,
    requirement: "Matching funds / cost-share required",
    isCritical: true,
  },
  {
    re: /\bevaluation\s+criteria\b|\bselection\s+criteria\b|\bcriteres?\s+(?:d['’]evaluation|de\s+selection)\b|\bcritères?\s+(?:d['’]évaluation|de\s+sélection)\b/i,
    requirement: "Published evaluation criteria (review before drafting)",
    isCritical: false,
  },
  {
    re: /\breporting\s+requirements?\b|\bprogress\s+reports?\b|\bfinal\s+report\b|\brapport\s+(?:d['’]etape|final)\b|\brapport\s+(?:d['’]étape|final)\b/i,
    requirement: "Post-award reporting obligations",
    isCritical: false,
  },
];

/** Window of text around a match, for the verifiable `value` snippet. */
function snippetAround(text: string, index: number, length: number, pad = 90): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  const raw = text.slice(start, end);
  // PDF/table-of-contents dot-leaders ("........ 4" between a heading and its
  // page number) survive markdown conversion as literal runs of periods —
  // \s+ collapsing alone leaves them intact, so a snippet landing near one
  // read as garbled noise ("........ 4 3. Critères de sélection ........")
  // instead of the real requirement text. Collapse any run of 3+ dots (with
  // optional interspersed spaces) to a single separator before trimming.
  const cleaned = raw
    .replace(/(?:\.\s?){3,}/g, " ... ")
    .replace(/\s+/g, " ")
    .trim();
  return `${prefix}${cleaned}${suffix}`;
}

/**
 * Analyze grant markdown for requirements that organizations need to know about.
 */
export function analyzeGrantRequirements(grantMarkdown: string): {
  requirements: GrantRequirement[];
  summary: string;
  hasContactInfo: boolean;
  requiresCredentialVerification: boolean;
} {
  const requirements: GrantRequirement[] = [];
  const structured = detectStructuredData(grantMarkdown);

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

  for (const p of DOCUMENT_PATTERNS) {
    const m = p.re.exec(grantMarkdown);
    if (m) {
      requirements.push({
        category: "document",
        requirement: p.requirement,
        value: snippetAround(grantMarkdown, m.index, m[0].length),
        isCritical: p.isCritical,
      });
    }
  }

  for (const p of PROCESS_PATTERNS) {
    const m = p.re.exec(grantMarkdown);
    if (m) {
      requirements.push({
        category: "process",
        requirement: p.requirement,
        value: snippetAround(grantMarkdown, m.index, m[0].length),
        isCritical: p.isCritical,
      });
    }
  }

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
 * Format requirements for plain-text display.
 */
export function formatGrantRequirements(
  analysis: ReturnType<typeof analyzeGrantRequirements>,
): string {
  if (analysis.requirements.length === 0) {
    return analysis.summary;
  }

  const lines: string[] = [analysis.summary, ""];

  for (const req of analysis.requirements) {
    const icon = req.isCritical ? "[critical]" : "[info]";
    const value = req.value ? ` (${req.value})` : "";
    lines.push(`${icon} ${req.requirement}${value}`);
  }

  if (analysis.hasContactInfo) {
    lines.push("");
    lines.push("[contact] You can contact the grantor directly for questions.");
  }

  return lines.join("\n");
}
