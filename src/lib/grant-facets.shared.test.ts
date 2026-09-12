import { describe, expect, it } from "vitest";
import { GRANT_FACET_FIELDS, resolveGrantFacet } from "./grant-facets.shared";

const evidence = (field: string, value: unknown, confidence = 0.9) => ({
  id: crypto.randomUUID(),
  field,
  value,
  confidence,
  source_url: "https://example.gc.ca/program",
  snippet: "Official program eligibility text with enough context.",
});

describe.each(GRANT_FACET_FIELDS)("%s facet evidence", (field) => {
  it("resolves a positive assertion", () => {
    const result = resolveGrantFacet({
      field,
      evidence: [evidence(`facet.${field}`, { assertion: "supports", values: ["nonprofit"] })],
    });
    expect(result).toMatchObject({ state: "known", values: ["nonprofit"], confidence: 0.9 });
  });

  it("preserves unknown even when legacy display data exists", () => {
    const result = resolveGrantFacet({
      field,
      canonicalValue: "legacy display value",
      evidence: [],
    });
    expect(result).toMatchObject({ state: "unknown", values: ["legacy display value"] });
    expect(result.confidence).toBeNull();
  });

  it("surfaces directly conflicting assertions", () => {
    const result = resolveGrantFacet({
      field,
      evidence: [
        evidence(field, { assertion: "supports", values: ["nonprofit"] }, 0.95),
        evidence(field, { assertion: "excludes", values: ["Non-profit"] }, 0.8),
      ],
    });
    expect(result.state).toBe("conflicting");
    expect(result.excludedValues).toEqual(["Non-profit"]);
    expect(result.confidence).toBe(0.8);
  });
});

it("does not infer an exclusion from ordinary eligibility prose", () => {
  const result = resolveGrantFacet({
    field: "applicant_types",
    evidence: [evidence("eligibility", "For-profit organizations are not eligible")],
  });
  expect(result.state).toBe("unknown");
  expect(result.excludedValues).toEqual([]);
});

