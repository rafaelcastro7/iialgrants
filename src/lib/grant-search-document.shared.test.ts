import { describe, expect, it } from "vitest";
import { buildGrantSearchDocument } from "./grant-search-document.shared";

describe("canonical grant search document", () => {
  it("includes bilingual text, funder, sectors and eligibility deterministically", () => {
    const source = {
      title: "Healthy Aging Fund",
      title_fr: "Fonds pour le vieillissement en santé",
      summary: "Community research",
      summary_fr: "Recherche communautaire",
      sectors: ["health"],
      eligibility: { applicant: "nonprofit" },
      requirements: { partner: true },
      funder: { name: "Canada", name_fr: "Canada", jurisdiction: "federal" },
    };
    const first = buildGrantSearchDocument(source);
    const second = buildGrantSearchDocument(source);
    expect(first).toEqual(second);
    expect(first.embeddingText).toContain("Healthy Aging Fund");
    expect(first.embeddingText).toContain("vieillissement en santé");
    expect(first.embeddingText).toContain("nonprofit");
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
