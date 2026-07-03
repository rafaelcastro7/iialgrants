import { describe, expect, it } from "vitest";
import { evaluateLlmFields, type SourcePage } from "@/agents/enricher-steps.server";

const PAGE: SourcePage = {
  url: "https://funder.ca/program",
  markdown: "Grants of up to $250,000 CAD. Deadline is March 31, 2027. Open to non-profits.",
};

// Grounding stub: a quote is grounded iff the page contains it verbatim.
const pageForQuote = (quote: string) => (PAGE.markdown.includes(quote) ? PAGE : null);

const field = (value: unknown, quote: string) => ({ value, quote });

describe("evaluateLlmFields", () => {
  it("accepts grounded, well-typed fields and normalizes values", () => {
    const { accepted, rejected } = evaluateLlmFields({
      fieldsObj: {
        amount_cad_max: field(250000, "up to $250,000 CAD"),
        deadline: field("2027-03-31", "Deadline is March 31, 2027"),
        sectors: field(["tech", 42], "Open to non-profits"),
      },
      stillMissing: ["amount_cad_max", "deadline", "sectors"],
      pageForQuote,
    });
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(3);
    const byField = Object.fromEntries(accepted.map((d) => [d.field, d.value]));
    expect(byField.amount_cad_max).toBe(250000);
    expect(byField.deadline).toBe("2027-03-31");
    expect(byField.sectors).toEqual(["tech", "42"]); // coerced to strings
    expect(accepted[0].page.url).toBe(PAGE.url);
  });

  it("rejects hallucinated quotes not found in any source page", () => {
    const { accepted, rejected } = evaluateLlmFields({
      fieldsObj: { amount_cad_max: field(999999, "grants of up to $999,999 guaranteed") },
      stillMissing: ["amount_cad_max"],
      pageForQuote,
    });
    expect(accepted).toEqual([]);
    expect(rejected).toEqual(["amount_cad_max(hallucination)"]);
  });

  it("rejects fields that were not requested", () => {
    const { rejected } = evaluateLlmFields({
      fieldsObj: { amount_cad_max: field(250000, "up to $250,000 CAD") },
      stillMissing: ["deadline"],
      pageForQuote,
    });
    expect(rejected).toEqual(["amount_cad_max(not_needed)"]);
  });

  it("rejects unsolicited eligibility/sectors (must not overwrite extractor values)", () => {
    const { accepted, rejected } = evaluateLlmFields({
      fieldsObj: {
        eligibility: field({ nonprofit: true }, "Open to non-profits"),
        sectors: field(["health"], "Open to non-profits"),
      },
      stillMissing: ["deadline"],
      pageForQuote,
    });
    expect(accepted).toEqual([]);
    expect(rejected).toEqual(
      expect.arrayContaining(["eligibility(not_needed)", "sectors(not_needed)"]),
    );
  });

  it("rejects type-invalid values with a reason tag", () => {
    const { accepted, rejected } = evaluateLlmFields({
      fieldsObj: {
        amount_cad_min: field("lots of money", "up to $250,000 CAD"),
        deadline: field("March 31st", "Deadline is March 31, 2027"),
        eligibility: field(["should", "be", "object"], "Open to non-profits"),
        sectors: field("not-an-array", "Open to non-profits"),
      },
      stillMissing: ["amount_cad_min", "deadline", "eligibility", "sectors"],
      pageForQuote,
    });
    expect(accepted).toEqual([]);
    expect(rejected).toEqual(
      expect.arrayContaining([
        "amount_cad_min(not_number)",
        "deadline(bad_date)",
        "eligibility(bad_object)",
        "sectors(bad_array)",
      ]),
    );
  });

  it("rejects malformed field shapes (missing/short quote)", () => {
    const { rejected } = evaluateLlmFields({
      fieldsObj: { deadline: { value: "2027-03-31" }, amount_cad_max: field(1000, "up") },
      stillMissing: ["deadline", "amount_cad_max"],
      pageForQuote,
    });
    expect(rejected).toEqual(expect.arrayContaining(["deadline(shape)", "amount_cad_max(shape)"]));
  });

  it("rejects zero and negative amounts", () => {
    const { rejected } = evaluateLlmFields({
      fieldsObj: { amount_cad_min: field(0, "up to $250,000 CAD") },
      stillMissing: ["amount_cad_min"],
      pageForQuote,
    });
    expect(rejected).toEqual(["amount_cad_min(not_number)"]);
  });
});
