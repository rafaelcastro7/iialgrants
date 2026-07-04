import { describe, expect, it } from "vitest";
import { computeProposalReadiness } from "@/lib/proposal-readiness";

describe("computeProposalReadiness", () => {
  it("flags missing drafts and citations as blocked", () => {
    const out = computeProposalReadiness({
      sections: [
        {
          id: "s1",
          kind: "budget",
          heading_en: "Budget",
          content_en: "",
          citations: [],
          critic_notes: { must_cover: ["matching funds"] },
        },
      ],
      requirements: [{ requirement: "Matching funds required", isCritical: true }],
    });

    expect(out.score).toBeLessThan(50);
    expect(out.readySections).toBe(0);
    expect(out.openCriticalRequirements).toContain("Matching funds required");
    expect(out.sections[0].status).toBe("blocked");
  });

  it("marks cited sections and covered critical requirements as ready", () => {
    const out = computeProposalReadiness({
      sections: [
        {
          id: "s1",
          kind: "budget",
          heading_en: "Budget",
          content_en:
            "The budget includes matching funds from confirmed partners and explains how the organization will manage eligible project costs across the delivery period.",
          citations: [{ marker: "[d1]", chunk_id: "c1", snippet: "matching funds" }],
          critic_notes: { must_cover: ["matching funds"] },
        },
      ],
      requirements: [{ requirement: "Matching funds required", isCritical: true }],
    });

    expect(out.score).toBeGreaterThanOrEqual(80);
    expect(out.readySections).toBe(1);
    expect(out.coveredCriticalRequirements).toBe(1);
    expect(out.openCriticalRequirements).toEqual([]);
  });
});
