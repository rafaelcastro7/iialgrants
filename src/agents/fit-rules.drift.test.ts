import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, detectOrgRulesDrift, type FitRules } from "@/agents/fit-rules.shared";

const storedRules = (patch: Partial<FitRules> = {}): FitRules => ({
  ...DEFAULT_RULES,
  ...patch,
});

describe("detectOrgRulesDrift", () => {
  it("does not warn without both an org profile and stored rules", () => {
    expect(detectOrgRulesDrift(null, storedRules())).toEqual([]);
    expect(detectOrgRulesDrift({ jurisdictions: ["ON"] }, null)).toEqual([]);
  });

  it("reports contradictory jurisdiction and applicant-type rules as errors", () => {
    const issues = detectOrgRulesDrift(
      {
        jurisdictions: ["ON"],
        applicant_types: ["nonprofit"],
      },
      storedRules({
        required_jurisdictions: ["BC"],
        applicant_types_allowed: ["for-profit"],
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "jurisdiction_drift", level: "error" }),
        expect.objectContaining({ id: "applicant_type_drift", level: "error" }),
      ]),
    );
  });

  it("reports materially different funding ranges as warnings", () => {
    const issues = detectOrgRulesDrift(
      { funding_min_cad: 50_000, funding_max_cad: 500_000 },
      storedRules({ min_amount_cad: 5_000, max_amount_cad: 5_000_000 }),
    );

    expect(issues.map(({ id, level }) => ({ id, level }))).toEqual(
      expect.arrayContaining([
        { id: "min_amount_drift", level: "warn" },
        { id: "max_amount_drift", level: "warn" },
      ]),
    );
  });

  it("returns no issues when explicit org facts and stored rules agree", () => {
    const issues = detectOrgRulesDrift(
      {
        jurisdictions: ["ON", "QC"],
        sectors: ["education"],
        applicant_types: ["nonprofit"],
        funding_min_cad: 25_000,
        funding_max_cad: 250_000,
      },
      storedRules({
        required_jurisdictions: ["qc", "on"],
        iial_capabilities: ["Education"],
        applicant_types_allowed: ["Nonprofit"],
        min_amount_cad: 25_000,
        max_amount_cad: 250_000,
      }),
    );

    expect(issues).toEqual([]);
  });
});
