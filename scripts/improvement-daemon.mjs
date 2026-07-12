#!/usr/bin/env node
// Continuous-improvement daemon - turns the other daemons' raw output into a
// prioritized, actionable backlog for the /loop (or a human) to act on. Each
// cycle it gathers recent signal (audit findings, the latest self-eval
// scorecard + regressions, recent commit subjects) and, ONLY when the GPU is
// idle, asks the local coder model to synthesize the top improvement
// opportunities. It writes them to scripts/improvement-queue.md.
//
// SAFETY: this daemon never edits code or data. It proposes; the loop disposes.
// That boundary is deliberate - an unsupervised process auto-applying LLM code
// changes is exactly the kind of thing that turns a helper into a hazard.
//
// Usage: node scripts/improvement-daemon.mjs [intervalMinutes=45]

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { logTo, ollamaChatWhenIdle, stamp, registerDaemon } from "./daemon-shared.mjs";

const INTERVAL_MIN = Number(process.argv[2]) || 45;
const LOG_FILE = "scripts/improvement-report.log";
const QUEUE_FILE = "scripts/improvement-queue.md";
const AUDIT_LOG = "scripts/live-audit-report.log";
const SELF_EVAL_LOG = "scripts/self-eval-report.log";
const METRICS_FILE = "scripts/self-eval-metrics.jsonl";
const TECHNIQUES_FILE = "docs/TECHNIQUES.md";
const MEMORY_DIR =
  process.env.CLAUDE_MEMORY_DIR ||
  "C:/Users/rafae/.claude/projects/e--Documents-PROYECTOS-IialGrants/memory";
const REMEMBER_DIR = ".remember";

const log = (section, message) => logTo(LOG_FILE, section, message);

function tail(file, n) {
  if (!existsSync(file)) return "";
  const lines = readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-n).join("\n");
}

function recentCommits() {
  try {
    return execSync("git log --oneline -12", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// Pull the signal-carrying lines out of the audit log (skip the "clean" /
// heartbeat noise) so the model sees problems, not cycle markers. Deliberately
// EXCLUDES the "findings for" code-audit JSON dumps: those are the local 7B
// auditor's raw output, dominated by repeated false positives, and they balloon
// the prompt (~4x) with low-value noise. Lines are capped so one giant entry
// can't crowd out the rest.
function auditSignal() {
  if (!existsSync(AUDIT_LOG)) return "";
  const lines = readFileSync(AUDIT_LOG, "utf8").trim().split("\n").filter(Boolean);
  const interesting = lines.filter(
    (l) =>
      /(DOWN|SLOW|UNHEALTHY|DUPLICATE|WARNING|IMPLAUSIBLE|FABRICATED|stuck at max)/i.test(l) &&
      !/findings for/i.test(l),
  );
  return interesting
    .slice(-20)
    .map((l) => (l.length > 220 ? l.slice(0, 220) + "..." : l))
    .join("\n");
}

// Latest deterministic scorecard, so proposals can be grounded in real numbers
// ("completeness is 73.7% because 11 discovered grants lack amounts") instead
// of generic advice.
function latestScorecard() {
  try {
    if (!existsSync(METRICS_FILE)) return null;
    const lines = readFileSync(METRICS_FILE, "utf8").trim().split("\n").filter(Boolean);
    if (!lines.length) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

// Proven engineering techniques from docs/TECHNIQUES.md. The LLM prefers these
// over inventing new approaches, improving consistency and reuse.
function readTechniques() {
  try {
    if (!existsSync(TECHNIQUES_FILE)) return [];
    const content = readFileSync(TECHNIQUES_FILE, "utf8");
    const bullets = content
      .split("\n")
      .filter((l) => /^[-*]\s+/.test(l.trim()))
      .map((l) => l.trim().replace(/^[-*]\s+/, ""))
      .filter((l) => l.length > 10);
    return bullets;
  } catch {
    return [];
  }
}

// Lessons learned from memory and .remember logs. Extracted LECCIÓN/LESSON lines
// inform what succeeded/failed before, avoiding repeated mistakes.
function readLessons() {
  const sources = [];
  const dirs = [REMEMBER_DIR, MEMORY_DIR];
  const re = /(?:^|\n)[^\n]*\b(LECCIÓN|LESSON|LECCION)\b[:\s][^\n]*/gi;
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir);
      for (const f of files) {
        if (!f.endsWith(".md")) continue;
        const path = join(dir, f);
        const text = readFileSync(path, "utf8");
        sources.push(text);
      }
    } catch {
      // ignore
    }
  }
  const lessons = new Set();
  for (const src of sources) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = m[0].replace(/\s+/g, " ").trim();
      if (line.length > 20) lessons.add(line.slice(0, 300));
    }
  }
  return [...lessons];
}

async function cycle() {
  log("cycle", "--- gathering improvement signal ---");

  const signal = {
    latest_scorecard: latestScorecard(),
    recent_commits: recentCommits(),
    audit_findings: auditSignal(),
    self_eval_tail: tail(SELF_EVAL_LOG, 12),
    proven_techniques: readTechniques(),
    lessons_learned: readLessons(),
  };

  const hasSignal =
    !!signal.latest_scorecard ||
    signal.audit_findings.length > 0 ||
    signal.self_eval_tail.length > 0;
  if (!hasSignal) {
    log("cycle", "no daemon signal yet (audit/self-eval logs empty) - skipping proposal");
    log("cycle", `--- done, sleeping ${INTERVAL_MIN}m ---`);
    return;
  }

  // qwen2.5:7b over the coder variant: the coder model was not returning within
  // 300s on this GPU (a known local-runtime flake), while qwen2.5:7b answers
  // reliably in ~80-120s. Triage synthesis doesn't need code generation.
  const result = await ollamaChatWhenIdle(
    "qwen2.5:7b",
    [
      {
        role: "system",
        content:
          "You are a senior engineer triaging a grant-intelligence codebase (TanStack Start + Supabase + local Ollama). " +
          "You are given: latest_scorecard (real product metrics), recent_commits (already-done work), live audit findings, self-eval output, proven_techniques (engineering patterns that work here), and lessons_learned (what succeeded/failed before). " +
          "Propose the TOP 3-5 concrete, high-value improvements. STRICT rules: " +
          "(1) Every item MUST cite a specific number from latest_scorecard OR a specific line from audit_findings/self_eval_tail as its justification - no item without evidence. " +
          "(2) Do NOT propose anything already addressed in recent_commits. " +
          "(3) Do NOT propose generic advice (no 'improve performance', 'add tests', 'optimize' without a concrete, evidenced target). " +
          "(4) PREFER proven_techniques over inventing new approaches. If a technique from the list applies, cite it by name. " +
          "(5) AVOID patterns mentioned in lessons_learned that failed before; if you see a risk, flag it. " +
          "(6) Prefer correctness and information-completeness over cosmetics. " +
          "Format: a markdown list, ONE line per item, prefixed [P1]/[P2]/[P3], each ending with '(evidence: <the number or log line>)'. Add [technique: <name>] if you are applying a proven technique. No preamble, no closing remarks. " +
          "If the signal genuinely supports no new work, reply with exactly: [none] system is healthy; no evidenced improvements.",
      },
      { role: "user", content: JSON.stringify(signal) },
    ],
    // The GPU lock now serializes daemons, and keep_alive keeps qwen2.5:7b
    // warm — but a cold load is still ~77s on this Pascal GPU, so give 320s of
    // headroom. num_predict bounds output so it can't run away to the timeout.
    { timeoutMs: 320000, numCtx: 4096, numPredict: 600, holder: "improvement" },
  );

  if (result.skipped) {
    log("proposal", `skipped LLM synthesis (${result.reason}) - will retry next cycle`);
    log("cycle", `--- done, sleeping ${INTERVAL_MIN}m ---`);
    return;
  }

  const body =
    `# Continuous-improvement queue\n\n` +
    `_Auto-generated by improvement-daemon.mjs at ${stamp()} using local qwen2.5:7b ` +
    `(load tier ${result.loadTier}). Proposals only - nothing here was applied. ` +
    `The /loop or a human reviews and acts. Regenerated each cycle from live daemon signal._\n\n` +
    `${result.text.trim()}\n`;

  writeFileSync(QUEUE_FILE, body);
  log("proposal", `wrote ${QUEUE_FILE} (${result.text.trim().split("\n").length} item lines)`);
  log("cycle", `--- done, sleeping ${INTERVAL_MIN}m ---`);
}

async function main() {
  await registerDaemon("improvement");
  log("daemon", `improvement-daemon started, polling every ${INTERVAL_MIN} minutes`);
  while (true) {
    await cycle().catch((e) => log("cycle", `FATAL (continuing): ${e.message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main();
