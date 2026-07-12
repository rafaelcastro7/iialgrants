// Proof, not vibes, that the self-improvement system's core logic works:
// regression detection actually fires, daemon liveness/health is computed
// correctly, and the log parser handles real daemon output.
import { describe, expect, it } from "vitest";
import {
  daemonHealth,
  detectRegressions,
  isDaemonAlive,
  parseDaemonLine,
  systemVerdict,
  type ScorecardLike,
} from "@/lib/autonomy-logic";

const base: ScorecardLike = {
  ts: "2026-07-11T22:00:00.000Z",
  grounding_coverage_pct: 100,
  data_completeness_pct: 74,
  duplicate_clusters: 0,
  stuck_at_max_attempts: 1,
  fake_test_accounts: 0,
  fabricated_requirements: 0,
};

describe("detectRegressions", () => {
  it("is clean when nothing regressed", () => {
    expect(detectRegressions(base, base)).toEqual([]);
  });

  it("fires absolute red lines even with no baseline", () => {
    const r = detectRegressions(
      { ...base, fake_test_accounts: 3, fabricated_requirements: 2 },
      null,
    );
    expect(r).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fake test account"),
        expect.stringContaining("fabricated requirements"),
      ]),
    );
  });

  it("flags a real grounding-coverage drop", () => {
    const cur = { ...base, grounding_coverage_pct: 80 };
    const r = detectRegressions(cur, base);
    expect(r.some((f) => /grounding coverage dropped 100% -> 80%/.test(f))).toBe(true);
  });

  it("ignores noise below the drop threshold", () => {
    const cur = { ...base, grounding_coverage_pct: 97 }; // -3, under the 5-pt floor
    expect(detectRegressions(cur, base)).toEqual([]);
  });

  it("flags rising duplicates and stuck grants", () => {
    const cur = { ...base, duplicate_clusters: 2, stuck_at_max_attempts: 4 };
    const r = detectRegressions(cur, base);
    expect(r.some((f) => /duplicate clusters rose 0 -> 2/.test(f))).toBe(true);
    expect(r.some((f) => /stuck grants rose 1 -> 4/.test(f))).toBe(true);
  });

  it("does not flag improvements", () => {
    const cur = { ...base, grounding_coverage_pct: 100, data_completeness_pct: 90 };
    expect(detectRegressions(cur, base)).toEqual([]);
  });
});

describe("parseDaemonLine", () => {
  it("parses a real daemon log line", () => {
    const p = parseDaemonLine(
      "[2026-07-11T23:28:40.883Z] [scorecard] grants=52 active=18 grounding=100%",
    );
    expect(p.ts).toBe("2026-07-11T23:28:40.883Z");
    expect(p.section).toBe("scorecard");
    expect(p.message).toContain("grants=52");
  });

  it("degrades gracefully on an unstructured line", () => {
    const p = parseDaemonLine("just some text");
    expect(p.ts).toBeNull();
    expect(p.message).toBe("just some text");
  });
});

describe("isDaemonAlive", () => {
  const now = Date.parse("2026-07-11T23:30:00.000Z");
  it("alive when within 2.5x the interval", () => {
    expect(isDaemonAlive(now - 20 * 60_000, 15, now)).toBe(true); // 20min < 37.5min
  });
  it("stale when past 2.5x the interval", () => {
    expect(isDaemonAlive(now - 40 * 60_000, 15, now)).toBe(false); // 40min > 37.5min
  });
  it("dead when never ran", () => {
    expect(isDaemonAlive(null, 15, now)).toBe(false);
  });
});

describe("daemonHealth + systemVerdict", () => {
  it("silent when it never logged a cycle", () => {
    expect(daemonHealth({ alive: false, lastCycleAt: null, recentCount: 0 }).status).toBe("silent");
  });
  it("stale when alive is false but it has run before", () => {
    expect(daemonHealth({ alive: false, lastCycleAt: "x", recentCount: 3 }).status).toBe("stale");
  });
  it("silent when alive but only heartbeat lines remain", () => {
    expect(daemonHealth({ alive: true, lastCycleAt: "x", recentCount: 0 }).status).toBe("silent");
  });
  it("healthy when alive with recent signal", () => {
    expect(daemonHealth({ alive: true, lastCycleAt: "x", recentCount: 5 }).status).toBe("healthy");
  });
  it("system is only OK when every daemon is healthy", () => {
    const allGood = systemVerdict([
      { status: "healthy", detail: "" },
      { status: "healthy", detail: "" },
    ]);
    expect(allGood.ok).toBe(true);
    const oneDown = systemVerdict([
      { status: "healthy", detail: "" },
      { status: "stale", detail: "" },
    ]);
    expect(oneDown.ok).toBe(false);
    expect(oneDown.label).toBe("1/2 daemons healthy");
  });
});
