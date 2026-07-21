import { describe, expect, it } from "vitest";
import { extractGcCandidates } from "./gc-proactive.server";

describe("extractGcCandidates", () => {
  it("keeps strong grantmaker names and aggregates repeated awards", () => {
    const rows = [
      { recipient_legal_name: "Toronto Community Foundation", agreement_value: 100_000 },
      { recipient_legal_name: "Toronto Community Foundation", agreement_value: 50_000 },
    ];
    const result = extractGcCandidates(rows);
    expect(result).toHaveLength(1);
    expect(result[0].raw_metadata).toMatchObject({
      gc_grants_received: 2,
      gc_total_received: 150_000,
    });
  });

  it("does not mistake ordinary community organizations for grantmakers", () => {
    const result = extractGcCandidates([
      { recipient_legal_name: "Community Living Toronto", recipient_type: "foundation" },
      { recipient_legal_name: "Canadian Wildlife Association" },
      { recipient_legal_name: "Neighbourhood Housing Society" },
      { recipient_legal_name: "The Governing Council of Example University" },
      { recipient_legal_name: "Northern Education Council" },
    ]);
    expect(result).toEqual([]);
  });

  it("retains councils whose names explicitly identify a funding mandate", () => {
    const result = extractGcCandidates([
      { recipient_legal_name: "Canada Council for the Arts" },
      { recipient_legal_name: "Social Sciences and Humanities Research Council" },
    ]);
    expect(result.map((candidate) => candidate.name)).toEqual([
      "Canada Council for the Arts",
      "Social Sciences and Humanities Research Council",
    ]);
  });
});
