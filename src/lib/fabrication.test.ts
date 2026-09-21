import { describe, expect, it } from "vitest";
import { fabrications } from "./fabrication";

describe("fabrication detector", () => {
  it("allows numbers present in facts", () => {
    const facts = ["Annual operating budget is $250,000 across 3 community programs."];
    const draft = "We operate 3 programs with a $250,000 budget.";
    expect(fabrications(draft, facts)).toEqual([]);
  });

  it("flags ungrounded digits", () => {
    const facts = ["Budget is $100,000."];
    const draft = "We served 850 youth across 12 centres.";
    const result = fabrications(draft, facts);
    expect(result).toEqual([
      { kind: "number", text: "850" },
      { kind: "number", text: "12" },
    ]);
  });

  it("handles spelled numbers matching digits in facts", () => {
    const facts = ["Operating 6 regional sites."];
    const draft = "We have six regional sites.";
    expect(fabrications(draft, facts)).toEqual([]);
  });

  it("flags invented personnel with titles", () => {
    const facts = ["The team has certified environmental consultants."];
    const draft = "The project is directed by Dr. Jane Doe and Mr. Bob Vance.";
    const result = fabrications(draft, facts);
    expect(result.some((f) => f.kind === "person" && f.text.includes("Jane Doe"))).toBe(true);
    expect(result.some((f) => f.kind === "person" && f.text.includes("Bob Vance"))).toBe(true);
  });

  it("ignores explicit gap placeholders", () => {
    const facts = ["We have an expanding outreach."];
    const draft = "We will hire [NEED: 5 outreach coordinators] for the project.";
    expect(fabrications(draft, facts)).toEqual([]);
  });
});
