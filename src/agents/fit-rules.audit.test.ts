import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  deriveRulesFromOrg,
  evaluateRules,
  type FitRules,
} from "@/agents/fit-rules.server";

const check = (result: ReturnType<typeof evaluateRules>, id: string) =>
  result.checks.find((item) => item.id === id);

const grant = {
  title: "Workforce innovation fund",
  summary: "Digital transformation and supply chain training for applicants.",
  eligibility: "Eligible applicants include non-profit organizations and registered charities.",
  sectors: ["technology"],
  country: "CA",
  amount_cad_min: 100_000,
  amount_cad_max: 250_000,
  deadline: "2026-12-31",
};

describe("fit-rule audit boundaries", () => {
  it("parses Postgres-array focus areas without leaking braces", () => {
    const rules = deriveRulesFromOrg({ sectors: ["tech"], focus_areas: "{R&D,export}" });
    expect(rules.required_sectors).toEqual(["tech", "R&D", "export"]);
  });

  it("matches a capability inside structured JSON punctuation", () => {
    const result = evaluateRules(
      { ...DEFAULT_RULES, required_jurisdictions: [], required_sectors: [] },
      { eligibility: { ai_ml: true } },
    );
    expect(check(result, "sop_filter_4_strategic")?.status).toBe("pass");
  });

  it("F1 passes an explicit nonprofit eligibility clause", () => {
    const result = evaluateRules(DEFAULT_RULES, grant, new Date("2026-07-21T12:00:00Z"));
    expect(check(result, "sop_filter_1_legal")?.status).toBe("pass");
    expect(result.hard_fail).toBe(false);
  });

  it("F1 hard-blocks a municipality-only opportunity for the nonprofit profile", () => {
    const result = evaluateRules(
      DEFAULT_RULES,
      { ...grant, eligibility: "Applicants must be municipalities only." },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "sop_filter_1_legal")?.status).toBe("fail");
    expect(result.hard_fail).toBe(true);
  });

  it("F1 reads structured snake_case applicant types", () => {
    const result = evaluateRules(
      DEFAULT_RULES,
      { ...grant, eligibility: { for_profit: true } },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "sop_filter_1_legal")?.status).toBe("fail");
    expect(result.hard_fail).toBe(true);
  });

  it("treats national grants as compatible with a province-based organization", () => {
    const rules = { ...DEFAULT_RULES, required_jurisdictions: ["ON"] };
    const result = evaluateRules(rules, grant, new Date("2026-07-21T12:00:00Z"));
    expect(check(result, "jurisdiction_required")?.status).toBe("pass");
  });

  it("treats a provincial grant as compatible with a Canada-wide organization", () => {
    const result = evaluateRules(
      DEFAULT_RULES,
      { ...grant, country: "QC" },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "jurisdiction_required")?.status).toBe("pass");
  });

  it("skips unknown jurisdiction instead of fabricating a hard failure", () => {
    const result = evaluateRules(
      DEFAULT_RULES,
      { ...grant, country: null },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "jurisdiction_required")?.status).toBe("skip");
    expect(result.hard_fail).toBe(false);
  });

  it("F4 does not match the capability 'ai' inside the word training", () => {
    const rules: FitRules = {
      ...DEFAULT_RULES,
      required_jurisdictions: [],
      applicant_types_allowed: [],
      applicant_types_excluded: [],
      iial_capabilities: ["ai"],
    };
    const result = evaluateRules(
      rules,
      { ...grant, summary: "Workforce training and leadership development." },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "sop_filter_4_strategic")?.status).toBe("fail");
  });

  it("normalizes common sector aliases without broad substring matching", () => {
    const rules = { ...DEFAULT_RULES, required_sectors: ["tech", "clean-tech"] };
    const result = evaluateRules(
      rules,
      { ...grant, sectors: ["Technology", "Clean Technology"] },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "sectors_required")?.status).toBe("pass");
  });

  it("F3 cost-share obeys the configured hard-fail policy", () => {
    const rules = { ...DEFAULT_RULES, hard_fail_on_amount: true };
    const result = evaluateRules(
      rules,
      { ...grant, summary: "Applicants must provide a 75% cost-share contribution." },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(check(result, "sop_filter_3_costshare")?.status).toBe("fail");
    expect(result.hard_fail).toBe(true);
  });

  it("F5 replaces the generic minimum-days rule when runway is configured", () => {
    const rules = { ...DEFAULT_RULES, min_days_to_deadline: 365 };
    const result = evaluateRules(rules, grant, new Date("2026-07-21T12:00:00Z"));
    expect(check(result, "sop_filter_5_runway")?.status).toBe("pass");
    expect(check(result, "deadline")).toBeUndefined();
  });
});
