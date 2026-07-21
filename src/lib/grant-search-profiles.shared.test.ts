import { describe, expect, it } from "vitest";
import { SearchFeedbackInput, SearchProfileInput } from "./grant-search-profiles.shared";

describe("grant search profile contracts", () => {
  it("accepts a complete project intent", () => {
    const profile = SearchProfileInput.parse({
      name: "AI workforce project",
      mission: "Train nonprofit staff in applied AI",
      sectors: ["AI", "workforce development"],
      jurisdictions: ["CA", "ON"],
      applicant_types: ["nonprofit"],
      amount_min_cad: 50_000,
      amount_max_cad: 250_000,
      role: "lead",
    });
    expect(profile.jurisdictions).toEqual(["CA", "ON"]);
    expect(profile.active).toBe(true);
  });

  it("rejects inverted amount and date ranges", () => {
    expect(() =>
      SearchProfileInput.parse({ name: "bad", amount_min_cad: 10, amount_max_cad: 5 }),
    ).toThrow();
    expect(() =>
      SearchProfileInput.parse({
        name: "bad",
        project_start: "2026-10-01",
        project_end: "2026-09-01",
      }),
    ).toThrow();
  });

  it("requires controlled, reversible feedback", () => {
    expect(
      SearchFeedbackInput.parse({
        profile_id: "11111111-1111-4111-8111-111111111111",
        grant_id: "22222222-2222-4222-8222-222222222222",
        action: "restored",
      }).action,
    ).toBe("restored");
    expect(() =>
      SearchFeedbackInput.parse({
        profile_id: "11111111-1111-4111-8111-111111111111",
        grant_id: "22222222-2222-4222-8222-222222222222",
        action: "deleted",
      }),
    ).toThrow();
  });
});
