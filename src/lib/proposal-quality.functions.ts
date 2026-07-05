"use server";

import {
  scoreProposal,
  getReviewerArchetypes,
  getProposalReviews,
} from "./multi-expert-review.server";
import { generateComplianceMatrix, getRequirementTemplates } from "./compliance-matrix.server";
import { extractCitations, validateCitation, getCitationSummary } from "./citation-tracker.server";

export { scoreProposal, getReviewerArchetypes, getProposalReviews };
export { generateComplianceMatrix, getRequirementTemplates };
export { extractCitations, validateCitation, getCitationSummary };
