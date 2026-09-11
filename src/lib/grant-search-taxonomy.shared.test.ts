import { describe, expect, it } from "vitest";
import { expandGrantSearchQuery } from "./grant-search-taxonomy.shared";

describe("bilingual grant query taxonomy", () => {
  it("normalizes accents and expands French healthy-aging intent", () => {
    const result = expandGrantSearchQuery("vieillissement en santé");
    expect(result.concepts).toEqual(["healthy-aging"]);
    expect(result.lexicalQueries).toContain("healthy aging");
  });

  it("expands youth, RISE and Quebec AI tax-credit concepts", () => {
    expect(expandGrantSearchQuery("hire young graduates").concepts).toContain("youth-employment");
    expect(expandGrantSearchQuery("RISE Germany").lexicalQueries.join(" ")).toContain("Globalink");
    expect(expandGrantSearchQuery("crédit d'impôt IA").concepts).toContain("quebec-ai-tax-credit");
  });

  it("recovers maintained typo, French Indigenous, and defence research intents", () => {
    expect(expandGrantSearchQuery("industrial reserch assistance")).toMatchObject({
      concepts: ["canadian-innovation-agencies"],
    });
    expect(expandGrantSearchQuery("rayonnement autochtone innovation")).toMatchObject({
      concepts: ["indigenous-innovation"],
    });
    expect(expandGrantSearchQuery("defence security applied research")).toMatchObject({
      concepts: ["defence-research"],
    });
    expect(expandGrantSearchQuery("partenariats scientifiques pêche Québec")).toMatchObject({
      concepts: ["fisheries-science-partnerships"],
    });
  });

  it("is bounded and leaves unrelated negative queries untouched", () => {
    expect(expandGrantSearchQuery("privacy policy")).toMatchObject({
      concepts: [],
      lexicalQueries: ["privacy policy"],
      semanticQuery: "privacy policy",
      suppressSemantic: true,
    });
    expect(expandGrantSearchQuery("quebec ai tax credit", 2).lexicalQueries).toHaveLength(2);
  });
});
