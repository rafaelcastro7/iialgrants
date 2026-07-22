import { describe, it, expect } from "vitest";
import { evaluateRules, DEFAULT_RULES, deriveRulesFromOrg, computeAxisBreakdown, assessBudgetCapacity } from "@/agents/fit-rules.server";

describe("adversarial edge cases", () => {
  it("fully empty/null grant against DEFAULT_RULES", () => {
    const grant = {
      amount_cad_min: null,
      amount_cad_max: null,
      deadline: null,
      eligibility: null,
      sectors: [],
      country: null,
      summary: null,
      title: null,
    };
    const result = evaluateRules(DEFAULT_RULES, grant as never);
    console.log("EMPTY GRANT:", JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
  });

  it("negative / absurd amounts", () => {
    const grant = {
      amount_cad_min: -50000,
      amount_cad_max: -1,
      deadline: null,
      eligibility: {},
      sectors: [],
      country: "CA",
      summary: "test",
      title: "test",
    };
    const rules = { ...DEFAULT_RULES, min_amount_cad: 10000, max_amount_cad: 500000 };
    const result = evaluateRules(rules, grant as never);
    console.log("NEGATIVE AMOUNTS:", JSON.stringify(result.checks.filter(c => c.id.startsWith("amount")), null, 2));
  });

  it("deadline exactly today / already passed / far future", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    for (const deadline of ["2026-07-22", "2020-01-01", "2099-12-31", "not-a-date", "2026-13-45"]) {
      const grant = {
        amount_cad_min: null, amount_cad_max: null, deadline,
        eligibility: {}, sectors: [], country: "CA", summary: "x", title: "x",
      };
      const result = evaluateRules({ ...DEFAULT_RULES, min_days_to_deadline: 30 }, grant as never, now);
      const deadlineCheck = result.checks.find(c => c.id === "deadline" || c.id === "sop_filter_5_runway");
      console.log(`deadline="${deadline}":`, JSON.stringify(deadlineCheck));
    }
  });

  it("assessBudgetCapacity with zero/negative budget", () => {
    console.log("budget=0:", JSON.stringify(assessBudgetCapacity(0, 10000, 20000)));
    console.log("budget=-5000:", JSON.stringify(assessBudgetCapacity(-5000, 10000, 20000)));
    console.log("budget=1, grant=0:", JSON.stringify(assessBudgetCapacity(1, 0, 0)));
    console.log("both null:", JSON.stringify(assessBudgetCapacity(null, null, null)));
    console.log("NaN budget:", JSON.stringify(assessBudgetCapacity(NaN, 10000, 20000)));
  });

  it("deriveRulesFromOrg with malformed focus_areas string", () => {
    const weird = deriveRulesFromOrg({
      sectors: [],
      focus_areas: "{{{malformed,,,}}}",
    } as never);
    console.log("malformed focus_areas:", JSON.stringify(weird.iial_capabilities));
    console.log("malformed required_sectors:", JSON.stringify(weird.required_sectors));
  });

  it("computeAxisBreakdown with unknown check ids (not in AXIS_OF map)", () => {
    const checks = [
      { id: "totally_unknown_check_id", status: "pass" as const, hard: false, detail: "x" },
    ];
    const axes = computeAxisBreakdown(checks);
    console.log("unknown-id axes:", JSON.stringify(axes.map(a => ({ axis: a.axis, status: a.status, score: a.score }))));
  });

  it("cost share detection edge cases", () => {
    const grant = (hay: string) => ({
      amount_cad_min: null, amount_cad_max: null, deadline: null,
      eligibility: { description: hay }, sectors: [], country: "CA", summary: "", title: "",
    });
    const rules = { ...DEFAULT_RULES, max_cost_share_pct_org_carries: 50 };
    for (const hay of [
      "funder covers up to 150%", // >100, should be rejected/ignored
      "requires 0% cost-share",
      "the ratio is 0/0",
      "50/50 cost sharing arrangement",
    ]) {
      const r = evaluateRules(rules, grant(hay) as never);
      const check = r.checks.find(c => c.id === "sop_filter_3_costshare");
      console.log(`hay="${hay}" cost_share_pct=${r.cost_share_pct}`, JSON.stringify(check));
    }
  });
});
