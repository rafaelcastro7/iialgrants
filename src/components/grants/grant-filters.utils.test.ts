import { describe, expect, it } from "vitest";
import { applyGrantFilters, collectSectors, sortGrants } from "./grant-filters.utils";

const ranked = [
  { title: "Typo-relevant first", status: "discovered", fit_score: 0.1 },
  { title: "High fit second", status: "scored", fit_score: 0.95 },
];

describe("grant catalog result handling", () => {
  it("preserves server relevance order", () => {
    expect(sortGrants(ranked, "relevance").map((grant) => grant.title)).toEqual([
      "Typo-relevant first",
      "High fit second",
    ]);
  });

  it("does not mutate ranked server results", () => {
    const result = sortGrants(ranked, "relevance");
    expect(result).not.toBe(ranked);
    expect(ranked[0].title).toBe("Typo-relevant first");
  });

  it("retains local structured filters after server-side text retrieval", () => {
    const result = applyGrantFilters(
      [
        { ...ranked[0], deadline: "2026-12-01" },
        { ...ranked[1], deadline: null },
      ],
      { search: "", jurisdiction: "all", eligibleOnly: false, onlyWithDeadline: true },
    );
    expect(result.map((grant) => grant.title)).toEqual(["Typo-relevant first"]);
  });

  it("filters by sector, case-insensitively", () => {
    const grants = [
      { ...ranked[0], sectors: ["Clean Tech", "AI"] },
      { ...ranked[1], sectors: ["Forestry"] },
    ];
    const result = applyGrantFilters(grants, {
      search: "",
      jurisdiction: "all",
      sector: "ai",
      eligibleOnly: false,
      onlyWithDeadline: false,
    });
    expect(result.map((grant) => grant.title)).toEqual(["Typo-relevant first"]);
  });

  it("collects distinct, sorted sector values across grants", () => {
    const grants = [
      { ...ranked[0], sectors: ["ai", "Clean Tech"] },
      { ...ranked[1], sectors: ["clean tech", "Forestry", null as unknown as string] },
    ];
    expect(collectSectors(grants)).toEqual(["ai", "clean tech", "Clean Tech", "Forestry"]);
  });

  it("filters by amount preset, excluding grants with no known amount", () => {
    const grants = [
      { ...ranked[0], amount_cad_min: 10_000, amount_cad_max: 20_000 }, // under25k
      { ...ranked[1], amount_cad_min: 50_000, amount_cad_max: 80_000 }, // 25k-100k
      { title: "No amount", status: "discovered" }, // unknown amount
    ];
    const under25k = applyGrantFilters(grants, {
      search: "",
      jurisdiction: "all",
      amountPreset: "under25k",
      eligibleOnly: false,
      onlyWithDeadline: false,
    });
    expect(under25k.map((g) => g.title)).toEqual(["Typo-relevant first"]);

    const anyAmount = applyGrantFilters(grants, {
      search: "",
      jurisdiction: "all",
      amountPreset: "all",
      eligibleOnly: false,
      onlyWithDeadline: false,
    });
    expect(anyAmount).toHaveLength(3);
  });
});
