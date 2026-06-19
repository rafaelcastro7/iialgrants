import { describe, expect, it } from "vitest";
import { DiscovererOutput, EnricherOutput, EvaluatorOutput, PROMPTS } from "@/agents/schemas";

describe("agents/schemas", () => {
  it("accepts a valid discoverer output", () => {
    const sample = {
      grants: [
        {
          title: "Canada Digital Adoption Program",
          title_fr: "Programme canadien d'adoption du numérique",
          summary: "Helps SMBs adopt digital technologies.",
          amount_cad_min: 0,
          amount_cad_max: 15000,
          deadline: "2026-09-30",
          eligibility: { country: "CA", stage: "smb" },
          sectors: ["tech", "retail"],
          language: "en",
          url: "https://ised-isde.canada.ca/site/canada-digital-adoption-program/en",
        },
      ],
    };
    expect(() => DiscovererOutput.parse(sample)).not.toThrow();
  });

  it("rejects invalid deadlines", () => {
    const bad = {
      grants: [{
        title: "X", url: "https://example.ca", language: "en",
        deadline: "30/09/2026",
      }],
    };
    expect(() => DiscovererOutput.parse(bad)).toThrow();
  });

  it("enricher requires french translation", () => {
    expect(() =>
      EnrichedGrant.parse({
        title: "T", url: "https://example.ca", language: "en",
        amount_cad_min: null, amount_cad_max: null, deadline: null,
        title_fr: null as unknown as string, summary_fr: null,
      }),
    ).toThrow();
  });

  it("prompts are versioned", () => {
    expect(PROMPTS.discoverer.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PROMPTS.enricher.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
