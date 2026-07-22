import { describe, expect, it } from "vitest";
import {
  scoreGrantForProfile,
  type SearchProfileForRanking,
} from "./grant-search-profile-ranking.shared";

const profile: SearchProfileForRanking = {
  mission: "healthy aging",
  activities: ["research"],
  populations_served: ["seniors"],
  funding_uses: ["community outreach"],
  sectors: ["health"],
  jurisdictions: ["CA"],
  applicant_types: ["nonprofit"],
  amount_min_cad: 25_000,
  amount_max_cad: 100_000,
  required_terms: [],
  excluded_terms: ["loan"],
};

const grant = {
  title: "Healthy Aging Community Research Fund",
  title_fr: "Fonds de recherche sur le vieillissement en santé",
  summary: "Supports seniors through nonprofit community outreach.",
  summary_fr: null,
  sectors: ["Health"],
  amount_cad_min: 50_000,
  amount_cad_max: 75_000,
  funder: { jurisdiction: "Canada" },
};

describe("profile-aware grant ranking", () => {
  it("returns an auditable high score for a strong match", () => {
    const result = scoreGrantForProfile(grant, profile);
    expect(result.hardBlocked).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.matched).toContain("amount");
    expect(result.matched.some((item) => item.startsWith("sector:"))).toBe(true);
  });

  it("normalizes French accents", () => {
    const result = scoreGrantForProfile(grant, {
      ...profile,
      mission: "vieillissement en sante",
      activities: [],
      populations_served: [],
      funding_uses: [],
      sectors: [],
      jurisdictions: [],
      amount_min_cad: null,
      amount_max_cad: null,
    });
    expect(result.score).toBe(100);
  });

  it("matches mission concepts without requiring the full phrase verbatim", () => {
    const result = scoreGrantForProfile(
      { ...grant, title: "Community Living Lab", summary: "Research for healthy aging." },
      {
        ...profile,
        mission: "healthy aging community research",
        activities: [],
        populations_served: [],
        funding_uses: [],
        sectors: [],
        jurisdictions: [],
        amount_min_cad: null,
        amount_max_cad: null,
      },
    );
    expect(result.score).toBe(100);
  });

  it("hard-blocks excluded and missing required terms", () => {
    expect(scoreGrantForProfile({ ...grant, summary: "Repayable loan" }, profile).hardBlocked).toBe(
      true,
    );
    expect(
      scoreGrantForProfile(grant, { ...profile, excluded_terms: [], required_terms: ["quantum"] }),
    ).toMatchObject({ hardBlocked: true, score: 0, missing: ["required:quantum"] });
  });
});
