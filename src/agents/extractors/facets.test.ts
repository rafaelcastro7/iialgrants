import { describe, expect, it } from "vitest";
import { extractGrantFacets } from "./facets.server";

describe("extractGrantFacets", () => {
  it("extracts grounded applicant, population, use, and funder facets", () => {
    const rows = extractGrantFacets(
      "The Government of Canada funds wages and training for nonprofit organizations serving Indigenous youth.",
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "applicant_types",
          value: "nonprofit",
          assertion: "supports",
        }),
        expect.objectContaining({ field: "populations_served", value: "Indigenous peoples" }),
        expect.objectContaining({ field: "populations_served", value: "youth" }),
        expect.objectContaining({ field: "funding_uses", value: "wages" }),
        expect.objectContaining({ field: "funding_uses", value: "training" }),
        expect.objectContaining({ field: "funder_type", value: "government" }),
      ]),
    );
  });

  it("records an explicit exclusion without converting it into support", () => {
    const rows = extractGrantFacets("For-profit organizations are not eligible for this program.");
    expect(rows).toContainEqual(
      expect.objectContaining({
        field: "applicant_types",
        value: "for-profit",
        assertion: "excludes",
      }),
    );
  });

  it("returns no invented values when the source is silent", () => {
    expect(extractGrantFacets("Applications close in October.")).toEqual([]);
  });
});
