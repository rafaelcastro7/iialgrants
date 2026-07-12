// Pure, unit-tested logic for the Autonomy command center and the self-eval
// daemon. Kept free of fs/DB/LLM so it can be tested deterministically - the
// point is that "it detects regressions / knows when a daemon is dead" is a
// proven claim, not a vibe. autonomy-intel.server.ts imports these; the
// self-eval daemon (.mjs, can't import TS at runtime) keeps a mirror copy of
// detectRegressions with a comment pointing here as the canonical, tested spec.

export type ScorecardLike = {
  ts: string;
  grounding_coverage_pct: number;
  data_completeness_pct: number;
  duplicate_clusters: number;
  stuck_at_max_attempts: number;
  fake_test_accounts: number;
  fabricated_requirements: number;
};

// Compare current vs previous scorecard; return human-readable regression
// flags. Absolute red lines (fake accounts, fabricated requirements) fire even
// with no previous scorecard; the rest need a baseline to compare against.
export function detectRegressions(
  cur: ScorecardLike,
  prev: ScorecardLike | null,
  { groundingDropPct = 5, completenessDropPct = 5 } = {},
): string[] {
  const flags: string[] = [];
  if (cur.fake_test_accounts > 0) flags.push(`${cur.fake_test_accounts} fake test account(s)`);
  if (cur.fabricated_requirements > 0)
    flags.push(`${cur.fabricated_requirements} grant(s) with fabricated requirements`);
  if (!prev) return flags;
  if (cur.grounding_coverage_pct < prev.grounding_coverage_pct - groundingDropPct)
    flags.push(
      `grounding coverage dropped ${prev.grounding_coverage_pct}% -> ${cur.grounding_coverage_pct}%`,
    );
  if (cur.data_completeness_pct < prev.data_completeness_pct - completenessDropPct)
    flags.push(
      `data completeness dropped ${prev.data_completeness_pct}% -> ${cur.data_completeness_pct}%`,
    );
  if (cur.duplicate_clusters > prev.duplicate_clusters)
    flags.push(`duplicate clusters rose ${prev.duplicate_clusters} -> ${cur.duplicate_clusters}`);
  if (cur.stuck_at_max_attempts > prev.stuck_at_max_attempts)
    flags.push(`stuck grants rose ${prev.stuck_at_max_attempts} -> ${cur.stuck_at_max_attempts}`);
  return flags;
}

export type ParsedLine = { ts: string | null; section: string; message: string };

// "[2026-07-11T22:43:39.560Z] [section] message" -> parts.
export function parseDaemonLine(line: string): ParsedLine {
  const m = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { ts: null, section: "", message: line };
  return { ts: m[1], section: m[2], message: m[3] };
}

// A daemon is "alive" if its most recent cycle is newer than 2.5x its poll
// interval (allows one slow cycle before we call it stale). Pure: takes the
// timestamps as numbers so it's trivially testable.
export function isDaemonAlive(
  lastCycleMs: number | null,
  intervalMin: number,
  nowMs: number,
  slackFactor = 2.5,
): boolean {
  if (lastCycleMs == null) return false;
  return nowMs - lastCycleMs < intervalMin * slackFactor * 60_000;
}

export type DaemonHealthInput = {
  alive: boolean;
  lastCycleAt: string | null;
  recentCount: number;
};

export type DaemonHealth = { status: "healthy" | "stale" | "silent"; detail: string };

// A daemon is only genuinely "working" if it's alive AND has actually emitted
// signal. This is the anti-smoke check: a process that's running but has never
// logged a cycle is not doing its job.
export function daemonHealth(d: DaemonHealthInput): DaemonHealth {
  if (!d.lastCycleAt) return { status: "silent", detail: "no cycles ever logged" };
  if (!d.alive) return { status: "stale", detail: "last cycle older than 2.5x its interval" };
  if (d.recentCount === 0) {
    return { status: "silent", detail: "alive, but no signal lines after heartbeat filtering" };
  }
  return { status: "healthy", detail: `alive, ${d.recentCount} recent signal line(s)` };
}

// Roll up the three daemons into one honest system verdict for the tab.
export function systemVerdict(healths: DaemonHealth[]): {
  ok: boolean;
  label: string;
  healthy: number;
  total: number;
} {
  const healthy = healths.filter((h) => h.status === "healthy").length;
  const total = healths.length;
  return {
    ok: healthy === total && total > 0,
    label:
      total === 0
        ? "no daemons"
        : healthy === total
          ? "all systems operational"
          : `${healthy}/${total} daemons healthy`,
    healthy,
    total,
  };
}
