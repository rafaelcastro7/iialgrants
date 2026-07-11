// Regression tests for S3a: the reviewer-simulation submit gate. A proposal
// must not reach `submitted` unless it has been reviewed, scores well enough,
// has drafted content, and covers every critical funder requirement — unless
// the user explicitly forces it (tested at the route level, not here).
import { describe, expect, it } from "vitest";
import { canSubmit, MIN_CRITIC_SCORE_TO_SUBMIT } from "@/lib/submit-gate.shared";

const ready = {
  criticScore: 0.85,
  readinessScore: 90,
  openCriticalRequirements: 0,
  draftedSections: 4,
};

describe("canSubmit reviewer-simulation gate", () => {
  it("passes a fully-ready proposal", () => {
    const r = canSubmit(ready);
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("blocks a proposal that was never reviewed (critic_score null)", () => {
    const r = canSubmit({ ...ready, criticScore: null });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("not_reviewed");
  });

  it("blocks a low critic score", () => {
    const r = canSubmit({ ...ready, criticScore: MIN_CRITIC_SCORE_TO_SUBMIT - 0.01 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("low_critic_score");
  });

  it("accepts a score exactly at the threshold", () => {
    const r = canSubmit({ ...ready, criticScore: MIN_CRITIC_SCORE_TO_SUBMIT });
    expect(r.ok).toBe(true);
  });

  it("blocks when no sections are drafted", () => {
    const r = canSubmit({ ...ready, draftedSections: 0 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("no_sections_drafted");
  });

  it("blocks when a critical requirement is still open", () => {
    const r = canSubmit({ ...ready, openCriticalRequirements: 2 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("open_critical_requirements");
  });

  it("accumulates multiple reasons", () => {
    const r = canSubmit({
      criticScore: null,
      readinessScore: 10,
      openCriticalRequirements: 1,
      draftedSections: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining(["no_sections_drafted", "not_reviewed", "open_critical_requirements"]),
    );
  });
});
