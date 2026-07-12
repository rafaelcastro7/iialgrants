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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { logTo, ollamaChatWhenIdle, stamp } from "./daemon-shared.mjs";

const INTERVAL_MIN = Number(process.argv[2]) || 45;
const LOG_FILE = "scripts/improvement-report.log";
const QUEUE_FILE = "scripts/improvement-queue.md";
const AUDIT_LOG = "scripts/live-audit-report.log";
const SELF_EVAL_LOG = "scripts/self-eval-report.log";
const METRICS_FILE = "scripts/self-eval-metrics.jsonl";

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

async function cycle() {
  log("cycle", "--- gathering improvement signal ---");

  const signal = {
    latest_scorecard: latestScorecard(),
    recent_commits: recentCommits(),
    audit_findings: auditSignal(),
    self_eval_tail: tail(SELF_EVAL_LOG, 12),
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
          "You are given: latest_scorecard (real product metrics), recent_commits (already-done work), live audit findings, and self-eval output. " +
          "Propose the TOP 3-5 concrete, high-value improvements. STRICT rules: " +
          "(1) Every item MUST cite a specific number from latest_scorecard OR a specific line from audit_findings/self_eval_tail as its justification - no item without evidence. " +
          "(2) Do NOT propose anything already addressed in recent_commits. " +
          "(3) Do NOT propose generic advice (no 'improve performance', 'add tests', 'optimize' without a concrete, evidenced target). " +
          "(4) Prefer correctness and information-completeness over cosmetics. " +
          "Format: a markdown list, ONE line per item, prefixed [P1]/[P2]/[P3], each ending with '(evidence: <the number or log line>)'. No preamble, no closing remarks. " +
          "If the signal genuinely supports no new work, reply with exactly: [none] system is healthy; no evidenced improvements.",
      },
      { role: "user", content: JSON.stringify(signal) },
    ],
    // Warm qwen2.5:7b answers in well under 2 min; 240s covers a cold load.
    // num_predict bounds the backlog to a handful of lines (no runaway output).
    { timeoutMs: 240000, numCtx: 4096, numPredict: 600 },
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
  log("daemon", `improvement-daemon started, polling every ${INTERVAL_MIN} minutes`);
  while (true) {
    await cycle().catch((e) => log("cycle", `FATAL (continuing): ${e.message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main();
