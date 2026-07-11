// analyzeGrantRequirements: RFP-style document/process requirement extraction.
import { describe, expect, it } from "vitest";
import { analyzeGrantRequirements } from "@/agents/grant-requirements-analyzer.server";

const RFP = `
To apply, submit your application through our online portal by March 31.
Required documents: audited financial statements for the last two fiscal years,
a detailed project budget, letters of support from community partners, and your
certificate of incorporation. A letter of intent is required before the full
application (two-stage process). Recipients must provide matching funds of 25%.
Successful applicants must submit progress reports every six months.
Selection criteria include innovation, feasibility and community impact.
`;

describe("analyzeGrantRequirements - RFP documents & process", () => {
  const out = analyzeGrantRequirements(RFP);
  const byReq = (needle: string) =>
    out.requirements.find((r) => r.requirement.toLowerCase().includes(needle));

  it("extracts required documents with verifiable source snippets", () => {
    for (const needle of ["financial statements", "project budget", "support", "incorporation"]) {
      const r = byReq(needle);
      expect(r, `missing requirement: ${needle}`).toBeDefined();
      expect(r!.category).toBe("document");
      expect(r!.value ?? "").not.toBe(""); // snippet present
    }
  });

  it("extracts process requirements (two-stage, portal, matching, criteria, reporting)", () => {
    expect(byReq("two-stage")?.category).toBe("process");
    expect(byReq("portal")?.category).toBe("process");
    expect(byReq("matching funds")?.isCritical).toBe(true);
    expect(byReq("evaluation criteria")).toBeDefined();
    expect(byReq("reporting")).toBeDefined();
  });

  it("marks deal-breakers as critical", () => {
    expect(byReq("financial statements")?.isCritical).toBe(true);
    expect(byReq("two-stage")?.isCritical).toBe(true);
  });

  it("counts criticals in the summary", () => {
    expect(out.summary).toMatch(/\d+ requirement\(s\) identified \(\d+ critical\)/);
  });

  it("returns no document/process requirements on unrelated text", () => {
    const clean = analyzeGrantRequirements("A page about our team and history.");
    expect(
      clean.requirements.filter((r) => r.category === "document" || r.category === "process"),
    ).toEqual([]);
  });

  it("cleans PDF/table-of-contents dot-leaders out of the snippet instead of surfacing them verbatim", () => {
    // Real shape seen on a live grant page (PSCE Volet II): a scraped table
    // of contents renders as literal ".........." runs around the matched
    // keyword, which used to reach the UI as unreadable noise.
    const tocLike = `Programme d'aide ${".".repeat(40)} 4\n3. ${"critères de sélection"} ${".".repeat(40)}`;
    const result = analyzeGrantRequirements(tocLike);
    const criteria = result.requirements.find((r) =>
      r.requirement.toLowerCase().includes("evaluation criteria"),
    );
    expect(criteria).toBeDefined();
    // The cleanup collapses a dot-leader run to a literal "..." ellipsis
    // marker (3 dots) — the regression is a 4+ run of raw, uncollapsed dots.
    expect(criteria!.value).not.toMatch(/\.{4,}/);
  });
});
