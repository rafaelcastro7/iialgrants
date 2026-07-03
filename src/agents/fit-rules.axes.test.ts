// computeAxisBreakdown: deterministic multi-axis breakdown derived from the
// screening checks — the transparent "why" that beats an opaque single score.
import { describe, expect, it } from "vitest";
import { computeAxisBreakdown, deriveRulesFromOrg, evaluateRules } from "@/agents/fit-rules.server";

const check = (id: string, status: "pass" | "fail" | "warn" | "skip", hard = false) => ({
  id,
  status,
  hard,
  detail: `${id}:${status}`,
});

describe("computeAxisBreakdown", () => {
  it("returns all five axes in a stable order", () => {
    const axes = computeAxisBreakdown([]);
    expect(axes.map((a) => a.axis)).toEqual([
      "eligibility",
      "geography",
      "sector",
      "budget",
      "timeline",
    ]);
  });

  it("scores an axis 10 when all its checks pass, 0 when all fail", () => {
    const axes = computeAxisBreakdown([
      check("jurisdiction_required", "pass"),
      check("amount_min", "fail"),
      check("amount_max", "fail"),
    ]);
    const geo = axes.find((a) => a.axis === "geography")!;
    const budget = axes.find((a) => a.axis === "budget")!;
    expect(geo.score).toBe(10);
    expect(geo.status).toBe("pass");
    expect(budget.score).toBe(0);
    expect(budget.status).toBe("fail");
  });

  it("marks an axis N/A (null) when no check is evaluable", () => {
    const axes = computeAxisBreakdown([check("deadline", "skip")]);
    const timeline = axes.find((a) => a.axis === "timeline")!;
    expect(timeline.score).toBeNull();
    expect(timeline.status).toBe("na");
  });

  it("computes partial score and does not let warn/skip fabricate a pass", () => {
    const axes = computeAxisBreakdown([
      check("sectors_required", "pass"),
      check("sop_filter_4_strategic", "fail"),
      check("keywords_required", "warn"), // not evaluable
    ]);
    const sector = axes.find((a) => a.axis === "sector")!;
    expect(sector.score).toBe(5); // 1 pass of 2 evaluable
    expect(sector.status).toBe("partial");
  });

  it("propagates hardFail when a hard check fails in the axis", () => {
    const axes = computeAxisBreakdown([check("sop_filter_1_legal", "fail", true)]);
    const elig = axes.find((a) => a.axis === "eligibility")!;
    expect(elig.hardFail).toBe(true);
    expect(elig.reasons).toContain("sop_filter_1_legal:fail");
  });

  it("integrates with a real evaluateRules run (org-aware)", () => {
    const rules = deriveRulesFromOrg({ jurisdictions: ["ON"], sectors: ["ai"] });
    const grant = {
      country: "ON",
      sectors: ["ai", "technology"],
      eligibility: { nonprofit: true },
      summary: "AI innovation funding for Ontario non-profits",
      title: "Ontario AI Grant",
    };
    const axes = computeAxisBreakdown(evaluateRules(rules, grant).checks);
    const geo = axes.find((a) => a.axis === "geography")!;
    expect(geo.status).toBe("pass"); // ON grant matches ON org
    // Every axis carries human-readable reasons for transparency.
    expect(axes.every((a) => Array.isArray(a.reasons))).toBe(true);
  });
});
