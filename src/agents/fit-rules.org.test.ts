// deriveRulesFromOrg: personalize screening rules from the org's real profile,
// then feed them through the deterministic engine to prove org-vs-grant fit.
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, deriveRulesFromOrg, evaluateRules } from "@/agents/fit-rules.server";

describe("deriveRulesFromOrg", () => {
  it("returns the base rules unchanged when no org is given", () => {
    expect(deriveRulesFromOrg(null)).toEqual(DEFAULT_RULES);
    expect(deriveRulesFromOrg(undefined)).toEqual(DEFAULT_RULES);
  });

  it("overrides required jurisdictions from the org's declared jurisdictions", () => {
    const rules = deriveRulesFromOrg({ jurisdictions: ["ON", "QC"] });
    expect(rules.required_jurisdictions).toEqual(["ON", "QC"]);
  });

  it("keeps base jurisdictions when the org declares none", () => {
    const rules = deriveRulesFromOrg({ jurisdictions: [] });
    expect(rules.required_jurisdictions).toEqual(DEFAULT_RULES.required_jurisdictions);
  });

  it("merges sectors + focus_areas (array or string) into required_sectors, deduped", () => {
    const fromArray = deriveRulesFromOrg({
      sectors: ["ai", "technology"],
      focus_areas: ["ai", "supply chain"],
    });
    expect(new Set(fromArray.required_sectors)).toEqual(
      new Set(["ai", "technology", "supply chain"]),
    );

    const fromString = deriveRulesFromOrg({
      sectors: ["health"],
      focus_areas: "climate; ai, health",
    });
    expect(new Set(fromString.required_sectors)).toEqual(new Set(["health", "climate", "ai"]));
  });

  it("personalizes iial_capabilities from the org's own sectors/focus_areas instead of leaving DEFAULT_RULES' fixed keyword list for every org", () => {
    // Before this fix, every org (regardless of profile) was screened for
    // SOP F4 strategic fit against DEFAULT_RULES.iial_capabilities — a single
    // fixed keyword list belonging to one specific tenant — because only
    // required_sectors was derived here. A second org with a completely
    // different declared profile must get its OWN capability keywords.
    const rules = deriveRulesFromOrg({
      sectors: ["fintech", "logistics"],
      focus_areas: "cross-border payments",
    });
    expect(new Set(rules.iial_capabilities)).toEqual(
      new Set(["fintech", "logistics", "cross-border payments"]),
    );
    expect(rules.iial_capabilities).not.toEqual(DEFAULT_RULES.iial_capabilities);
  });

  it("keeps DEFAULT_RULES.iial_capabilities as the fallback when the org declares no sectors/focus_areas", () => {
    const rules = deriveRulesFromOrg({ jurisdictions: ["ON"] });
    expect(rules.iial_capabilities).toEqual(DEFAULT_RULES.iial_capabilities);
  });

  it("does not mutate the base rules object", () => {
    const before = JSON.stringify(DEFAULT_RULES);
    deriveRulesFromOrg({ jurisdictions: ["BC"], sectors: ["mining"] });
    expect(JSON.stringify(DEFAULT_RULES)).toBe(before);
  });

  it("makes a real grant score differ by org (org-vs-grant fit, not static)", () => {
    const grant = {
      country: "ON",
      sectors: ["ai", "technology"],
      eligibility: { nonprofit: true },
      summary: "AI innovation funding for Ontario non-profits",
      title: "Ontario AI Grant",
    };
    // An Ontario AI org: jurisdiction + sectors overlap → passes those checks.
    const onAiOrg = deriveRulesFromOrg({ jurisdictions: ["ON"], sectors: ["ai"] });
    // A BC mining org: neither jurisdiction nor sectors overlap.
    const bcMiningOrg = deriveRulesFromOrg({ jurisdictions: ["BC"], sectors: ["mining"] });

    const onResult = evaluateRules(onAiOrg, grant);
    const bcResult = evaluateRules(bcMiningOrg, grant);

    const jurisdiction = (r: ReturnType<typeof evaluateRules>) =>
      r.checks.find((c) => c.id === "jurisdiction_required");
    expect(jurisdiction(onResult)?.status).toBe("pass");
    expect(jurisdiction(bcResult)?.status).toBe("fail");
    // The mismatched org must not score at least as high as the aligned org.
    expect(bcResult.rule_score).toBeLessThanOrEqual(onResult.rule_score);
  });
});
