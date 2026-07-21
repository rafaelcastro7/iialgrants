import { describe, expect, it } from "vitest";
import { mergeCandidateEvidence } from "./orchestrator.server";
import { scoreCandidate } from "./scoring.server";

describe("multi-source candidate evidence", () => {
  it("preserves complementary facts and deduplicates source signals", () => {
    const merged = mergeCandidateEvidence(
      {
        name: "Example Foundation",
        website: "https://example.ca",
        funder_type: "Government program",
        source_signals: ["bbf_programs"],
        raw_metadata: { sample_program: "Skills" },
      },
      {
        name: "Example Foundation",
        province: "ON",
        disbursed_annual: 2_000_000,
        source_signals: ["bbf_programs", "otf_open"],
        raw_metadata: { otf_grants_count: 3 },
      },
    );

    expect(merged.source_signals).toEqual(["bbf_programs", "otf_open"]);
    expect(merged.raw_metadata).toMatchObject({ sample_program: "Skills", otf_grants_count: 3 });
    expect(scoreCandidate(merged)).toBeGreaterThanOrEqual(40);
  });

  it("does not erase stronger existing evidence with missing incoming fields", () => {
    const merged = mergeCandidateEvidence(
      {
        name: "Stable Foundation",
        bn_number: "123456789",
        website: "https://stable.ca",
        source_signals: ["t3010_charities"],
      },
      { name: "Stable Foundation", source_signals: ["otf_open"] },
    );
    expect(merged.bn_number).toBe("123456789");
    expect(merged.website).toBe("https://stable.ca");
  });
});
