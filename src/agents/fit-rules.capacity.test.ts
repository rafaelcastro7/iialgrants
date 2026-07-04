// assessBudgetCapacity: operational-capacity axis — grant amount vs org budget.
import { describe, expect, it } from "vitest";
import { assessBudgetCapacity } from "@/agents/fit-rules.server";

describe("assessBudgetCapacity", () => {
  it("is N/A when the org budget is unknown", () => {
    const a = assessBudgetCapacity(null, 10_000, 50_000);
    expect(a.axis).toBe("capacity");
    expect(a.score).toBeNull();
    expect(a.status).toBe("na");
    expect(a.hardFail).toBe(false);
  });

  it("is N/A when the grant amount is unknown", () => {
    const a = assessBudgetCapacity(500_000, null, null);
    expect(a.score).toBeNull();
    expect(a.status).toBe("na");
  });

  it("scores 10 when the grant is within annual budget", () => {
    const a = assessBudgetCapacity(500_000, null, 400_000);
    expect(a.score).toBe(10);
    expect(a.status).toBe("pass");
  });

  it("scores 7 (manageable) for 1–3× budget", () => {
    const a = assessBudgetCapacity(200_000, null, 500_000); // 2.5×
    expect(a.score).toBe(7);
    expect(a.status).toBe("pass");
  });

  it("scores 4 (stretch) for 3–5× budget", () => {
    const a = assessBudgetCapacity(100_000, null, 400_000); // 4×
    expect(a.score).toBe(4);
    expect(a.status).toBe("partial");
  });

  it("scores 1 and warns when the grant far exceeds capacity (>5×)", () => {
    const a = assessBudgetCapacity(50_000, null, 1_000_000); // 20×
    expect(a.score).toBe(1);
    expect(a.status).toBe("fail");
    expect(a.hardFail).toBe(false); // advisory, never a hard gate
    expect(a.reasons[0]).toMatch(/exceeds capacity/i);
  });

  it("flags a grant that is tiny relative to budget as low-ROI", () => {
    const a = assessBudgetCapacity(5_000_000, null, 20_000); // 0.4% of budget
    expect(a.reasons.some((r) => /low return/i.test(r))).toBe(true);
    expect(a.score).toBeLessThanOrEqual(8);
  });

  it("prefers max amount, falls back to min", () => {
    const a = assessBudgetCapacity(100_000, 80_000, null);
    expect(a.score).toBe(10); // 80k ≤ 100k
  });
});
