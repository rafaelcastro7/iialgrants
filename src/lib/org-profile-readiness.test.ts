import { describe, expect, it } from "vitest";
import { computeOrgProfileReadiness } from "@/lib/org-profile-readiness";

describe("computeOrgProfileReadiness", () => {
  it("does not claim an empty tenant is ready", () => {
    const result = computeOrgProfileReadiness({ org_name: "IIAL", jurisdictions: ["CA"] });
    expect(result.readyForVerifiedMatching).toBe(false);
    expect(result.criticalMissing.map((item) => item.key)).toEqual(
      expect.arrayContaining(["registration_status", "applicant_types", "mission", "sectors"]),
    );
  });

  it("distinguishes match blockers from useful enrichment gaps", () => {
    const result = computeOrgProfileReadiness({
      org_name: "IIAL",
      registration_status: "nonprofit",
      applicant_types: ["nonprofit"],
      jurisdictions: ["CA", "ON"],
      mission: "Expand access to applied learning.",
      sectors: ["education"],
    });
    expect(result.readyForVerifiedMatching).toBe(true);
    expect(result.score).toBeGreaterThan(35);
    expect(result.score).toBeLessThan(100);
    expect(result.items.find((item) => item.key === "capabilities")?.critical).toBe(false);
  });
});
