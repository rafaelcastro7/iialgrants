import { describe, expect, it } from "vitest";
import { classifyJurisdictionFit } from "./grants.functions";

const ORG = new Set(["CA", "ON", "QC"]);

describe("classifyJurisdictionFit", () => {
  it("treats a federal program as applicable anywhere in that country", () => {
    expect(classifyJurisdictionFit("CA-Federal", ORG)).toBe("match");
  });

  it("matches a province the org operates in", () => {
    expect(classifyJurisdictionFit("CA-ON", ORG)).toBe("match");
    expect(classifyJurisdictionFit("CA-QC", ORG)).toBe("match");
  });

  it("flags a province the org does not operate in as a mismatch", () => {
    // The case that motivated this: an Ontario/Quebec company was shown
    // "Innovation PEI Small Business Assistance" at the top of the list, and
    // the evaluator then correctly failed it on jurisdiction.
    expect(classifyJurisdictionFit("CA-PE", ORG)).toBe("mismatch");
    expect(classifyJurisdictionFit("CA-AB", ORG)).toBe("mismatch");
  });

  it("leaves foreign jurisdictions neutral rather than penalising them", () => {
    // A US program is not *unwinnable* the way an out-of-province Canadian
    // one is, so it must not be pushed below those.
    expect(classifyJurisdictionFit("US-HHS", ORG)).toBe("unknown");
    expect(classifyJurisdictionFit("Pan-American", ORG)).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(classifyJurisdictionFit("ca-on", ORG)).toBe("match");
    expect(classifyJurisdictionFit("CA-FEDERAL", ORG)).toBe("match");
  });

  it("stays neutral when either side is unknown", () => {
    expect(classifyJurisdictionFit(null, ORG)).toBe("unknown");
    expect(classifyJurisdictionFit("", ORG)).toBe("unknown");
    expect(classifyJurisdictionFit("CA-ON", new Set())).toBe("unknown");
  });

  it("matches an exact jurisdiction string the org declared verbatim", () => {
    expect(classifyJurisdictionFit("CA-ON", new Set(["CA-ON"]))).toBe("match");
  });
});
