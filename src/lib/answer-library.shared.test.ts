import { describe, expect, it } from "vitest";
import { formatAnswerKnowledgeChunk } from "@/lib/answer-library.shared";

describe("formatAnswerKnowledgeChunk", () => {
  it("keeps approved language and its receipt together for retrieval", () => {
    const chunk = formatAnswerKnowledgeChunk({
      label: "Organizational capacity",
      question: "Describe your track record",
      answer_en: "IIAL delivered three applied-learning programs with university partners.",
      evidence_notes: "2025 annual report, pages 4-6",
    });
    expect(chunk).toContain("Reusable response: Organizational capacity");
    expect(chunk).toContain("Approved answer: IIAL delivered three");
    expect(chunk).toContain("Evidence notes: 2025 annual report");
  });

  it("does not add empty optional headings", () => {
    const chunk = formatAnswerKnowledgeChunk({
      label: "Mission",
      answer_en: "IIAL expands access to practical learning opportunities.",
    });
    expect(chunk).not.toContain("Question:");
    expect(chunk).not.toContain("Evidence notes:");
  });
});
