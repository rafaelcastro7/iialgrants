import { describe, expect, it } from "vitest";
import { evaluateRules, DEFAULT_RULES, type FitRules } from "@/agents/fit-rules.server";

const baseGrant = {
  title: "Test grant",
  summary: "supply chain traceability for nonprofits in Canada",
  eligibility: "open to non-profit organizations",
  sectors: [] as string[],
  country: "CA",
  amount_cad_min: null,
  amount_cad_max: null,
  deadline: null as string | null,
};

describe("evaluateRules QW1 regressions", () => {
  it("does not award a perfect rule_score when no checks are evaluable", () => {
    const rules: FitRules = {
      ...DEFAULT_RULES,
      required_jurisdictions: [],
      iial_capabilities: [],
      applicant_types_excluded: [],
      applicant_types_allowed: [],
      required_sectors: [],
      excluded_sectors: [],
      required_keywords: [],
      excluded_keywords: [],
      min_amount_cad: null,
      max_amount_cad: null,
      max_cost_share_pct_org_carries: null,
      min_days_to_deadline: null,
      lead_min_weeks: null,
      partner_min_weeks: null,
    };
    const r = evaluateRules(rules, { ...baseGrant });
    expect(r.rule_score).toBeLessThanOrEqual(50);
    expect(r.rule_score).toBeLessThan(100);
  });

  it("treats an unparseable deadline as skip, not a hard fail", () => {
    const rules: FitRules = {
      ...DEFAULT_RULES,
      hard_fail_on_runway: true,
      rolling_intake_passes_runway: false,
      lead_min_weeks: 4,
      partner_min_weeks: 8,
    };
    const r = evaluateRules(rules, { ...baseGrant, deadline: "not-a-real-date" });
    const runway = r.checks.find((c) => c.id === "sop_filter_5_runway");
    expect(runway?.status).toBe("skip");
    expect(r.hard_fail).toBe(false);
  });

  it("still fails a genuinely past deadline when runway is required", () => {
    const rules: FitRules = {
      ...DEFAULT_RULES,
      hard_fail_on_runway: true,
      rolling_intake_passes_runway: false,
      lead_min_weeks: 4,
      partner_min_weeks: 8,
    };
    const r = evaluateRules(rules, { ...baseGrant, deadline: "2000-01-01" });
    const runway = r.checks.find((c) => c.id === "sop_filter_5_runway");
    expect(runway?.status).toBe("fail");
  });
});
