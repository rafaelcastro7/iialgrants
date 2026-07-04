// Regression tests for the 2026-07-04 logic audit fixes:
//  1. max_cost_share_pct_org_carries default was in the wrong scale (0.5
//     instead of 50), silently failing SOP F3 for every grant with detectable
//     cost-share language.
//  2. detectCostShare() inverted "requires N% cost-share/match/contribution"
//     (already the org's own share) the same way as "funder covers N%"
//     (the funder's share) — only the latter should be inverted.
//  3. GRANT_TRANSITIONS was missing "discovered" -> "scored", which the live
//     DB trigger allows.
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, evaluateRules } from "@/agents/fit-rules.server";
import { GRANT_TRANSITIONS, canTransition } from "@/agents/pipeline-stages.shared";

const baseGrant = {
  country: "CA",
  sectors: [],
  eligibility: {},
  summary: "",
  title: "Test grant",
};

describe("fit-rules reengineering fixes", () => {
  it("DEFAULT_RULES.max_cost_share_pct_org_carries is on a 0-100 scale, not 0-1", () => {
    // A real 20% cost-share requirement must be well under a sane percentage
    // cap. The old default (0.5) made this comparison "20 <= 0.5" (always
    // false) for every org using the unmodified defaults.
    expect(DEFAULT_RULES.max_cost_share_pct_org_carries).toBeGreaterThan(1);

    const grant = {
      ...baseGrant,
      summary: "Recipients must provide a 20% cost-share contribution.",
    };
    const result = evaluateRules(DEFAULT_RULES, grant);
    const costShareCheck = result.checks.find((c) => c.id === "sop_filter_3_costshare");
    expect(costShareCheck?.status).toBe("pass");
  });

  it("detectCostShare does not invert an org's own cost-share/match requirement", () => {
    const grant = { ...baseGrant, summary: "Applicants must cover a 20% match." };
    const result = evaluateRules(DEFAULT_RULES, grant);
    // 20% org share must stay ~20, never flip to 80.
    expect(result.cost_share_pct).toBe(20);
  });

  it("detectCostShare still inverts funder-coverage language", () => {
    const grant = { ...baseGrant, summary: "The program covers up to 75% of eligible costs." };
    const result = evaluateRules(DEFAULT_RULES, grant);
    // Funder covers 75% -> org carries the remaining 25%.
    expect(result.cost_share_pct).toBe(25);
  });

  it("GRANT_TRANSITIONS allows discovered -> scored (matches the live DB trigger)", () => {
    expect(GRANT_TRANSITIONS.discovered).toContain("scored");
    expect(canTransition("discovered", "scored")).toBe(true);
  });
});
