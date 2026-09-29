import fs from "node:fs";
import path from "node:path";

const GRANTDESK_LIB = "e:/dev/grantdesk/src/lib";
const GRANTDESK_COMPONENTS = "e:/dev/grantdesk/src/components";

// 1. src/lib/prioritization.ts
const prioritizationCode = `export type PrioritizationInput = {
  id: string;
  title: string;
  funderName: string;
  amountMax: number | null;
  relevance: number | null;
  requirementCount: number;
  deadline: string | null;
};

export type PrioritizationQuadrant = "quick_wins" | "high_value" | "filler" | "low_priority";

export type PrioritizedItem = PrioritizationInput & {
  expectedValue: number;
  estimatedHours: number;
  roiScore: number;
  quadrant: PrioritizationQuadrant;
};

export function calculateGrantRoi(input: PrioritizationInput): PrioritizedItem {
  const amount = input.amountMax || 50000;
  const rel = input.relevance || 0.5;
  const expectedValue = amount * rel;
  const estimatedHours = Math.max(8, input.requirementCount * 6);
  const roiScore = Math.round(expectedValue / estimatedHours);

  let quadrant: PrioritizationQuadrant = "filler";
  if (roiScore > 2000 && estimatedHours <= 20) quadrant = "quick_wins";
  else if (roiScore > 2000 && estimatedHours > 20) quadrant = "high_value";
  else if (roiScore <= 2000 && estimatedHours > 20) quadrant = "low_priority";

  return { ...input, expectedValue, estimatedHours, roiScore, quadrant };
}

export function prioritizeGrants(inputs: PrioritizationInput[]): PrioritizedItem[] {
  return inputs
    .map(calculateGrantRoi)
    .sort((a, b) => b.roiScore - a.roiScore);
}
`;

// 2. src/lib/prioritization.test.ts
const prioritizationTestCode = `import { describe, expect, it } from "vitest";
import { calculateGrantRoi, prioritizeGrants } from "./prioritization";

describe("prioritization logic", () => {
  it("calculates expected return and ROI score accurately", () => {
    const res = calculateGrantRoi({
      id: "1",
      title: "Tech Innovation Grant",
      funderName: "Innovation Canada",
      amountMax: 100000,
      relevance: 0.9,
      requirementCount: 2,
      deadline: "2026-12-31",
    });

    expect(res.expectedValue).toBe(90000); // 100000 * 0.9
    expect(res.estimatedHours).toBe(12); // 2 * 6 = 12
    expect(res.roiScore).toBe(7500); // 90000 / 12
    expect(res.quadrant).toBe("quick_wins"); // ROI > 2000 & hours <= 20
  });

  it("classifies high value bets when hours required are high", () => {
    const res = calculateGrantRoi({
      id: "2",
      title: "Large Scale Infrastructure",
      funderName: "Infrastructure Canada",
      amountMax: 500000,
      relevance: 0.8,
      requirementCount: 5,
      deadline: "2026-11-30",
    });

    expect(res.estimatedHours).toBe(30); // 5 * 6 = 30
    expect(res.quadrant).toBe("high_value"); // ROI > 2000 & hours > 20
  });

  it("sorts list by ROI score descending", () => {
    const list = prioritizeGrants([
      { id: "a", title: "Low ROI", funderName: "F1", amountMax: 10000, relevance: 0.2, requirementCount: 5, deadline: null },
      { id: "b", title: "High ROI", funderName: "F2", amountMax: 200000, relevance: 0.9, requirementCount: 2, deadline: null },
    ]);

    expect(list[0]!.id).toBe("b");
    expect(list[1]!.id).toBe("a");
  });
});
`;

// 3. src/lib/budget-analytics.ts
const budgetAnalyticsCode = `export type BudgetItemInput = {
  id: string;
  category: "Personnel" | "Equipment" | "Travel" | "Subcontracts" | "Indirect";
  description: string;
  plannedAmount: number;
  actualAmount?: number;
};

export type BudgetSummary = {
  totalPlanned: number;
  totalActual: number;
  netVariance: number;
  withinCap: boolean;
  categoryTotals: Record<string, number>;
};

export function calculateBudgetSummary(
  items: BudgetItemInput[],
  grantMaxAmount?: number | null
): BudgetSummary {
  let totalPlanned = 0;
  let totalActual = 0;
  const categoryTotals: Record<string, number> = {};

  for (const item of items) {
    totalPlanned += item.plannedAmount;
    totalActual += item.actualAmount || 0;
    categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.plannedAmount;
  }

  const netVariance = totalPlanned - totalActual;
  const withinCap = !grantMaxAmount || totalPlanned <= grantMaxAmount;

  return { totalPlanned, totalActual, netVariance, withinCap, categoryTotals };
}
`;

// 4. src/lib/budget-analytics.test.ts
const budgetAnalyticsTestCode = `import { describe, expect, it } from "vitest";
import { calculateBudgetSummary } from "./budget-analytics";

describe("budget-analytics", () => {
  it("computes totals, variance and cap compliance", () => {
    const summary = calculateBudgetSummary(
      [
        { id: "1", category: "Personnel", description: "Researcher", plannedAmount: 50000, actualAmount: 48000 },
        { id: "2", category: "Equipment", description: "Hardware", plannedAmount: 10000, actualAmount: 11000 },
      ],
      70000
    );

    expect(summary.totalPlanned).toBe(60000);
    expect(summary.totalActual).toBe(59000);
    expect(summary.netVariance).toBe(1000);
    expect(summary.withinCap).toBe(true);
    expect(summary.categoryTotals.Personnel).toBe(50000);
    expect(summary.categoryTotals.Equipment).toBe(10000);
  });

  it("flags when total planned exceeds grant maximum cap", () => {
    const summary = calculateBudgetSummary(
      [{ id: "1", category: "Personnel", description: "Lead", plannedAmount: 120000 }],
      100000
    );
    expect(summary.withinCap).toBe(false);
  });
});
`;

fs.writeFileSync(path.join(GRANTDESK_LIB, "prioritization.ts"), prioritizationCode, "utf-8");
fs.writeFileSync(
  path.join(GRANTDESK_LIB, "prioritization.test.ts"),
  prioritizationTestCode,
  "utf-8",
);
fs.writeFileSync(path.join(GRANTDESK_LIB, "budget-analytics.ts"), budgetAnalyticsCode, "utf-8");
fs.writeFileSync(
  path.join(GRANTDESK_LIB, "budget-analytics.test.ts"),
  budgetAnalyticsTestCode,
  "utf-8",
);

console.log("Written prioritization and budget-analytics logic and tests!");
