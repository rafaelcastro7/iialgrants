// Gate 1+ unit eval for the Writer citation validator.
// Ensures fabricated markers / unknown chunk ids are rejected — the
// non-negotiable correctness property of the Writer agent (ADR-005).
import { describe, it, expect } from "vitest";
import { validateCitations } from "@/agents/writer.functions";

const allowed = new Set([
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
]);

describe("Writer citation validator", () => {
  it("accepts content whose markers are declared and chunk_ids are allowed", () => {
    const r = validateCitations(
      "Our team has delivered AI products in Quebec [d1] and Ontario [d2].",
      [
        { marker: "[d1]", chunk_id: "11111111-1111-1111-1111-111111111111", snippet: "x" } as never,
        { marker: "[d2]", chunk_id: "22222222-2222-2222-2222-222222222222", snippet: "y" } as never,
      ],
      allowed,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects an undeclared marker", () => {
    const r = validateCitations(
      "We pioneered FR-CA NLP [d3].",
      [{ marker: "[d1]", chunk_id: "11111111-1111-1111-1111-111111111111", snippet: "z" } as never],
      allowed,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a citation referencing a chunk_id outside the retrieved set", () => {
    const r = validateCitations(
      "Strong track record [d1].",
      [{ marker: "[d1]", chunk_id: "99999999-9999-9999-9999-999999999999", snippet: "z" } as never],
      allowed,
    );
    expect(r.ok).toBe(false);
  });

  it("accepts content with no citations", () => {
    const r = validateCitations("Plain factual sentence with no marker.", [], allowed);
    expect(r.ok).toBe(true);
  });
});
