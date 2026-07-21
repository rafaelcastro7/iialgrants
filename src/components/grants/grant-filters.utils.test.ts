import { describe, expect, it } from "vitest";
import { applyGrantFilters, sortGrants } from "./grant-filters.utils";

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
});
