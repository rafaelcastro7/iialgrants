// Server-only reader for the Autonomy command center. Aggregates everything
// the local self-improvement daemons produce (see scripts/DAEMONS.md) plus the
// project's memory, Obsidian vault, lessons, techniques, and available skills,
// straight from the local filesystem. Node-only (fs/path) - imported lazily by
// autonomy-intel.functions.ts inside the server handler so it never reaches the
// client bundle. Every read is defensive: a missing file/dir degrades to an
// empty section, never an error.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  daemonHealth,
  detectRegressions,
  isDaemonAlive,
  parseDaemonLine,
  systemVerdict,
  type DaemonHealth,
} from "@/lib/autonomy-logic";

const ROOT = process.cwd();
// Cross-session memory + Obsidian + skills live outside the repo; paths are
// env-overridable so this works on any machine, and absent paths just yield
// empty sections.
const MEMORY_DIR =
  process.env.CLAUDE_MEMORY_DIR ||
  "C:/Users/rafae/.claude/projects/e--Documents-PROYECTOS-IialGrants/memory";
const OBSIDIAN_VAULT =
  process.env.OBSIDIAN_VAULT_DIR || "C:/Users/rafae/Documents/ClaudeMemoryVault";
const SKILLS_DIR = process.env.CLAUDE_SKILLS_DIR || "C:/Users/rafae/.claude/skills";

export type DaemonStatus = {
  key: string;
  name: string;
  description: string;
  intervalMin: number | null;
  alive: boolean;
  lastCycleAt: string | null;
  recent: string[];
};

export type Scorecard = {
  ts: string;
  total: number;
  active: number;
  by_status: Record<string, number>;
  stuck_at_max_attempts: number;
  scored_with_eval: number;
  grounding_coverage_pct: number;
  data_completeness_pct: number;
  fit_median: number;
  fit_range: [number, number];
  evaluations: number;
  duplicate_clusters: number;
  fake_test_accounts: number;
  fabricated_requirements: number;
  proposals: number;
  proposals_reviewed: number;
};

export type TrendPoint = {
  ts: string;
  grounding: number;
  completeness: number;
  fitMedian: number;
  active: number;
  stuck: number;
};

export type DaemonHealthRow = DaemonHealth & { key: string; name: string };

export type SelfCheck = {
  ok: boolean;
  label: string;
  healthy: number;
  total: number;
  daemons: DaemonHealthRow[];
};

export type AutonomyIntel = {
  generatedAt: string;
  selfCheck: SelfCheck;
  daemons: DaemonStatus[];
  scorecard: Scorecard | null;
  trend: TrendPoint[];
  regressions: string[];
  auditFindings: string[];
  repairs: string[];
  improvementQueue: string | null;
  criticisms: string | null;
  lessons: string[];
  memory: {
    index: string | null;
    now: string | null;
    recent: string | null;
    files: { name: string; description: string }[];
  };
  obsidian: { vaultExists: boolean; vaultPath: string; projectNotes: number; readme: boolean };
  skills: { name: string; description: string }[];
  techniques: string[];
};

function safeRead(path: string, maxChars = 40000): string | null {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8");
    return text.length > maxChars ? text.slice(text.length - maxChars) : text;
  } catch {
    return null;
  }
}

function tailLines(path: string, n: number): string[] {
  const text = safeRead(path);
  if (!text) return [];
  return text.trim().split("\n").filter(Boolean).slice(-n);
}

function readDaemon(
  key: string,
  name: string,
  description: string,
  logFile: string,
  defaultInterval: number,
): DaemonStatus {
  const path = resolve(ROOT, logFile);
  const lines = tailLines(path, 60);
  const parsed = lines.map(parseDaemonLine);

  // Interval from the "started, polling every N minutes" line if present.
  let intervalMin = defaultInterval;
  const startLine = [...parsed]
    .reverse()
    .find((p) => /polling every (\d+) minutes/.test(p.message));
  if (startLine) {
    const mm = startLine.message.match(/polling every (\d+) minutes/);
    if (mm) intervalMin = Number(mm[1]);
  }

  const withTs = parsed.filter((p) => p.ts);
  const lastCycleAt = withTs.length ? withTs[withTs.length - 1].ts! : null;
  const alive = isDaemonAlive(
    lastCycleAt ? new Date(lastCycleAt).getTime() : null,
    intervalMin,
    Date.now(),
  );

  // Keep substantive cycle results (findings, scorecards, "clean" / "no
  // regressions" verdicts, proposals, repairs). Drop only structural noise:
  // the "--- cycle ---" separators, the startup banner, and the "no new
  // commits" filler. A clean-but-working daemon still keeps its "clean" line so
  // it reads as healthy, not silent.
  const recent = parsed
    .filter(
      (p) =>
        p.message &&
        !/^---/.test(p.message) &&
        !/^no new commits/i.test(p.message) &&
        !/started, polling/i.test(p.message) &&
        !/started, checking/i.test(p.message),
    )
    .slice(-10)
    .map((p) => `${p.ts ? p.ts.slice(11, 19) + " " : ""}[${p.section}] ${p.message}`.slice(0, 300));

  return { key, name, description, intervalMin, alive, lastCycleAt, recent };
}

function readScorecardTrend(): {
  scorecard: Scorecard | null;
  previous: Scorecard | null;
  trend: TrendPoint[];
} {
  const text = safeRead(resolve(ROOT, "scripts/self-eval-metrics.jsonl"), 200000);
  if (!text) return { scorecard: null, previous: null, trend: [] };
  const rows: Scorecard[] = [];
  for (const line of text.trim().split("\n").filter(Boolean)) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed row
    }
  }
  if (rows.length === 0) return { scorecard: null, previous: null, trend: [] };
  const trend = rows.slice(-40).map((r) => ({
    ts: r.ts,
    grounding: r.grounding_coverage_pct,
    completeness: r.data_completeness_pct,
    fitMedian: r.fit_median,
    active: r.active,
    stuck: r.stuck_at_max_attempts,
  }));
  return {
    scorecard: rows[rows.length - 1],
    previous: rows.length > 1 ? rows[rows.length - 2] : null,
    trend,
  };
}

// Watchdog repair actions (restarts, kills, degraded/give-up flags) — the
// visible proof the system heals itself rather than silently rotting.
function readRepairs(): string[] {
  return tailLines(resolve(ROOT, "scripts/watchdog-report.log"), 200)
    .map(parseDaemonLine)
    .filter((p) => ["repair", "degraded", "giveup"].includes(p.section))
    .slice(-10)
    .map((p) =>
      `${p.ts ? p.ts.slice(0, 19).replace("T", " ") : ""} [${p.section}] ${p.message}`.slice(
        0,
        300,
      ),
    );
}

function readAuditFindings(): string[] {
  return tailLines(resolve(ROOT, "scripts/live-audit-report.log"), 300)
    .map(parseDaemonLine)
    .filter(
      (p) =>
        /(DOWN|SLOW|UNHEALTHY|DUPLICATE|WARNING|IMPLAUSIBLE|FABRICATED|stuck at max)/i.test(
          p.message,
        ) && !/findings for/i.test(p.message),
    )
    .slice(-12)
    .map((p) =>
      `${p.ts ? p.ts.slice(0, 19).replace("T", " ") : ""} [${p.section}] ${p.message}`.slice(
        0,
        280,
      ),
    );
}

// Pull "LESSON"/"LECCIÓN" lines from the cross-session memory + in-repo remember
// logs - the real, accumulated "what we learned the hard way".
function readLessons(): string[] {
  const sources: string[] = [];
  const remember = resolve(ROOT, ".remember");
  for (const f of ["now.md", "recent.md", "archive.md", "core-memories.md"]) {
    const t = safeRead(join(remember, f), 60000);
    if (t) sources.push(t);
  }
  if (existsSync(MEMORY_DIR)) {
    try {
      for (const f of readdirSync(MEMORY_DIR)) {
        if (f.endsWith(".md")) {
          const t = safeRead(join(MEMORY_DIR, f), 60000);
          if (t) sources.push(t);
        }
      }
    } catch {
      // ignore
    }
  }
  const lessons = new Set<string>();
  const re = /(?:^|\n)[^\n]*\b(LECCI[OÓ]N|LESSON|LECCION)\b[:\s][^\n]*/gi;
  for (const src of sources) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = m[0].replace(/\s+/g, " ").trim();
      if (line.length > 20) lessons.add(line.slice(0, 400));
    }
  }
  return [...lessons].slice(-30).reverse();
}

function readMemory() {
  const remember = resolve(ROOT, ".remember");
  const index = safeRead(join(MEMORY_DIR, "MEMORY.md"), 20000);
  const now = safeRead(join(remember, "now.md"), 30000);
  const recent = safeRead(join(remember, "recent.md"), 30000);
  const files: { name: string; description: string }[] = [];
  if (existsSync(MEMORY_DIR)) {
    try {
      for (const f of readdirSync(MEMORY_DIR)) {
        if (!f.endsWith(".md") || f === "MEMORY.md") continue;
        const t = safeRead(join(MEMORY_DIR, f), 4000) ?? "";
        const desc = t.match(/description:\s*["']?(.+?)["']?\s*(?:\n|$)/i);
        files.push({
          name: f.replace(/\.md$/, ""),
          description: desc ? desc[1].slice(0, 160) : "",
        });
      }
    } catch {
      // ignore
    }
  }
  return { index, now, recent, files: files.slice(0, 40) };
}

function readObsidian() {
  const vaultPath = OBSIDIAN_VAULT;
  let vaultExists = false;
  let projectNotes = 0;
  let readme = false;
  try {
    if (existsSync(vaultPath)) {
      vaultExists = true;
      readme = existsSync(join(vaultPath, "README.md"));
      // The IIAL memory is surfaced in Obsidian via a junction; count the .md
      // notes actually browsable for this project (the memory dir it mirrors).
      if (existsSync(MEMORY_DIR)) {
        projectNotes = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md")).length;
      }
    }
  } catch {
    // ignore
  }
  return { vaultExists, vaultPath, projectNotes, readme };
}

function readSkills(): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  try {
    if (!existsSync(SKILLS_DIR)) return out;
    for (const entry of readdirSync(SKILLS_DIR)) {
      const dir = join(SKILLS_DIR, entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const skillMd = safeRead(join(dir, "SKILL.md"), 3000);
      if (!skillMd) continue;
      const desc = skillMd.match(/description:\s*["']?(.+?)["']?\s*(?:\n|$)/i);
      out.push({ name: entry, description: desc ? desc[1].slice(0, 200) : "" });
    }
  } catch {
    // ignore
  }
  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
}

function readTechniques(): string[] {
  const text = safeRead(resolve(ROOT, "docs/TECHNIQUES.md"), 40000);
  if (!text) return [];
  return text
    .split("\n")
    .filter((l) => /^[-*]\s+/.test(l.trim()))
    .map((l) =>
      l
        .trim()
        .replace(/^[-*]\s+/, "")
        .replace(/\s+/g, " "),
    )
    .filter((l) => l.length > 8)
    .slice(0, 60);
}

function readCriticisms(): string | null {
  return safeRead(resolve(ROOT, "scripts/self-criticism-findings.md"), 30000);
}

export async function readAutonomyIntel(): Promise<AutonomyIntel> {
  const daemons = [
    readDaemon(
      "audit",
      "Live audit",
      "Process health, code audit, data anomalies",
      "scripts/live-audit-report.log",
      15,
    ),
    readDaemon(
      "self-eval",
      "Self-evaluation",
      "Product quality scorecard + regression flags",
      "scripts/self-eval-report.log",
      30,
    ),
    readDaemon(
      "improvement",
      "Continuous improvement",
      "Prioritized backlog synthesis (local LLM)",
      "scripts/improvement-report.log",
      45,
    ),
    readDaemon(
      "self-criticism",
      "Self-criticism",
      "Analyzes & criticizes detection/extraction pipelines",
      "scripts/self-criticism-report.log",
      60,
    ),
    readDaemon(
      "watchdog",
      "Watchdog",
      "Health-checks + restarts the other daemons",
      "scripts/watchdog-report.log",
      5,
    ),
  ];
  const { scorecard, previous, trend } = readScorecardTrend();

  // Per-daemon health + one honest system verdict, using the unit-tested
  // logic in autonomy-logic.ts - this is the anti-smoke check surfaced in the
  // tab: a daemon that's "running" but never logs a cycle reads as silent, not
  // green.
  const healthRows: DaemonHealthRow[] = daemons.map((d) => ({
    key: d.key,
    name: d.name,
    ...daemonHealth({ alive: d.alive, lastCycleAt: d.lastCycleAt, recentCount: d.recent.length }),
  }));
  const verdict = systemVerdict(healthRows);

  // Regressions computed from the metric series with the tested detector
  // (previous vs current scorecard), not scraped from log text.
  const regressions = scorecard ? detectRegressions(scorecard, previous) : [];

  return {
    generatedAt: new Date().toISOString(),
    selfCheck: { ...verdict, daemons: healthRows },
    daemons,
    scorecard,
    trend,
    regressions,
    auditFindings: readAuditFindings(),
    repairs: readRepairs(),
    improvementQueue: safeRead(resolve(ROOT, "scripts/improvement-queue.md"), 20000),
    criticisms: readCriticisms(),
    lessons: readLessons(),
    memory: readMemory(),
    obsidian: readObsidian(),
    skills: readSkills(),
    techniques: readTechniques(),
  };
}
