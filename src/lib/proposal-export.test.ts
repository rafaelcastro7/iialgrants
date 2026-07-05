// Regression tests for S3b: FR proposal export must NOT silently emit English
// as if it were French. Sections without an FR translation are flagged inline
// and reported in `missingTranslations`.
import { describe, expect, it } from "vitest";
import {
  buildProposalMarkdown,
  type ProposalExportProposal,
  type ProposalExportSection,
} from "@/lib/submissions.functions";

const proposal: ProposalExportProposal = {
  id: "abcdef12-0000-0000-0000-000000000000",
  title: "Test Proposal",
  version: 2,
  critic_score: 0.8,
  grant: {
    title: "Innovation Fund",
    title_fr: "Fonds d'innovation",
    deadline: "2026-12-31",
    amount_cad_min: 50000,
    amount_cad_max: 250000,
  },
};

const sections: ProposalExportSection[] = [
  {
    heading_en: "Executive Summary",
    heading_fr: "Résumé",
    content_en: "English summary.",
    content_fr: "Résumé en français.",
  },
  {
    heading_en: "Budget",
    heading_fr: null,
    content_en: "English budget only.",
    content_fr: null, // no FR translation
  },
];

describe("buildProposalMarkdown — FR honesty (S3b)", () => {
  it("uses real FR content when present", () => {
    const { markdown } = buildProposalMarkdown(proposal, sections, true);
    expect(markdown).toContain("Résumé en français.");
    expect(markdown).toContain("## Résumé");
    expect(markdown).toContain("Fonds d'innovation");
  });

  it("flags untranslated sections instead of passing EN off as FR", () => {
    const { markdown, missingTranslations } = buildProposalMarkdown(proposal, sections, true);
    expect(missingTranslations).toEqual(["Budget"]);
    expect(markdown).toContain("Traduction française manquante");
    // EN fallback text still included, but clearly marked as such.
    expect(markdown).toContain("English budget only.");
  });

  it("reports no missing translations when everything is translated", () => {
    const allFr = sections.map((s) => ({ ...s, heading_fr: "X", content_fr: "Y" }));
    const { missingTranslations } = buildProposalMarkdown(proposal, allFr, true);
    expect(missingTranslations).toEqual([]);
  });

  it("EN export never reports missing translations and uses EN grant title", () => {
    const { markdown, missingTranslations } = buildProposalMarkdown(proposal, sections, false);
    expect(missingTranslations).toEqual([]);
    expect(markdown).toContain("Grant: Innovation Fund");
    expect(markdown).toContain("## Budget");
    expect(markdown).not.toContain("Traduction");
  });

  it("filename derives from the proposal id", () => {
    const { filename } = buildProposalMarkdown(proposal, sections, false);
    expect(filename).toBe("proposal-abcdef12.md");
  });
});
