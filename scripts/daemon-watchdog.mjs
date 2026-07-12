#!/usr/bin/env node
// Watchdog daemon — validates the health of the three "construction" daemons
// (audit / self-eval / improvement) and REPAIRS them: a daemon whose process
// has died is restarted; one whose process is alive but hung (log not advancing
// past 3x its interval) is killed and restarted; one that is cycling but its
// results keep failing is flagged loudly (restarting an LLM timeout would just
// loop, so that's reported, not thrashed). This is the self-healing layer that
// makes "it keeps working" true instead of hopeful.
//
// Liveness = log freshness (each daemon timestamps every cycle) cross-checked
// with a PID file (daemon-shared registerDaemon). Restarts are rate-limited so
// a genuinely-broken daemon can't be relaunched in a tight loop.
//
// Usage: node scripts/daemon-watchdog.mjs [intervalMinutes=5]

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { registerDaemon, readDaemonPid, isProcessAlive, stamp } from "./daemon-shared.mjs";

const INTERVAL_MIN = Number(process.argv[2]) || 5;
const LOG_FILE = "scripts/watchdog-report.log";
const STATE_FILE = "scripts/.watchdog-state.json";
const MAX_RESTARTS_PER_HOUR = 4;

const MANAGED = [
  {
    key: "audit",
    script: "scripts/live-audit-daemon.mjs",
    interval: 15,
    log: "scripts/live-audit-report.log",
  },
  {
    key: "self-eval",
    script: "scripts/self-eval-daemon.mjs",
    interval: 30,
    log: "scripts/self-eval-report.log",
  },
  {
    key: "improvement",
    script: "scripts/improvement-daemon.mjs",
    interval: 45,
    log: "scripts/improvement-report.log",
  },
];

function log(section, message) {
  const line = `[${stamp()}] [${section}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    // fall through
  }
  return { restarts: {} }; // key -> array of ISO timestamps
}

function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // ignore
  }
}

// Last timestamped log line -> epoch ms (or null).
function lastCycleMs(logFile) {
  try {
    if (!existsSync(logFile)) return null;
    const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^\[([^\]]+)\]/);
      if (m) {
        const t = Date.parse(m[1]);
        if (Number.isFinite(t)) return t;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// Trailing run of failed improvement/eval results with no success since — a
// "cycling but not delivering" signal (reported, not auto-restarted).
function failureStreak(logFile) {
  try {
    if (!existsSync(logFile)) return 0;
    const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
    let streak = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (/wrote scripts\/|scorecard\]|no regressions|clean —|no anomalies/i.test(l)) break; // a success
      if (/skipped LLM synthesis|FATAL|ERROR:/i.test(l)) streak++;
    }
    return streak;
  } catch {
    return 0;
  }
}

function restartsInLastHour(state, key) {
  const cutoff = Date.now() - 3600_000;
  const list = (state.restarts[key] || []).filter((ts) => Date.parse(ts) > cutoff);
  state.restarts[key] = list;
  return list.length;
}

function startDaemon(d) {
  // Detached so it outlives the watchdog; stdio ignored (it logs to its file).
  const child = spawn("node", [d.script, String(d.interval)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child.pid;
}

async function checkOne(d, state) {
  const last = lastCycleMs(d.log);
  const staleMs = d.interval * 3 * 60_000; // 3 missed cycles = stale
  const logStale = last == null || Date.now() - last > staleMs;
  const pid = await readDaemonPid(d.key);
  const alive = isProcessAlive(pid);
  const ageMin = last ? Math.round((Date.now() - last) / 60_000) : null;

  // A registered process that is no longer alive is DEAD — restart it now,
  // regardless of how recent its last log line is (it was likely just killed or
  // crashed and will never log again). Only fall back to log-staleness when
  // there's no pid to check (a legacy/unregistered instance).
  const dead = pid != null && !alive;
  const needsRestart = dead || logStale;

  // Healthy: process alive (or pid-less legacy instance) + logging on schedule.
  if (!needsRestart) {
    const streak = failureStreak(d.log);
    if (streak >= 3) {
      log(
        "degraded",
        `${d.key}: cycling but last ${streak} result(s) failed (e.g. LLM timeout) — reporting, not restarting (a restart would loop). Underlying fix needed.`,
      );
      return { key: d.key, status: "degraded", ageMin, streak };
    }
    return { key: d.key, status: "healthy", ageMin };
  }

  // Stale. Rate-limit restarts so a broken daemon can't loop-spawn.
  const recent = restartsInLastHour(state, d.key);
  if (recent >= MAX_RESTARTS_PER_HOUR) {
    log(
      "giveup",
      `${d.key}: STALE (${ageMin ?? "?"}m, pid ${pid ?? "none"} ${alive ? "alive" : "dead"}) but already restarted ${recent}x this hour — needs manual intervention.`,
    );
    return { key: d.key, status: "unrecoverable", ageMin };
  }

  // If the process is alive but the log is stale, it's hung — kill it first.
  if (alive && pid) {
    try {
      process.kill(pid);
      log("repair", `${d.key}: hung (alive pid ${pid}, log ${ageMin}m stale) — killed it.`);
    } catch (e) {
      log("repair", `${d.key}: tried to kill hung pid ${pid} — ${e.message}`);
    }
  }

  const newPid = startDaemon(d);
  (state.restarts[d.key] = state.restarts[d.key] || []).push(new Date().toISOString());
  log(
    "repair",
    `${d.key}: RESTARTED (was ${last == null ? "never logged" : ageMin + "m stale"}, pid ${pid ?? "none"} ${alive ? "was-alive/hung" : "dead"}) -> new pid ${newPid}`,
  );
  return { key: d.key, status: "restarted", newPid };
}

async function cycle() {
  const state = loadState();
  const results = [];
  for (const d of MANAGED) {
    try {
      results.push(await checkOne(d, state));
    } catch (e) {
      log("cycle", `check ${d.key} failed: ${e.message}`);
    }
  }
  saveState(state);
  const healthy = results.filter((r) => r.status === "healthy").length;
  const summary = results.map((r) => `${r.key}:${r.status}`).join(" ");
  log("cycle", `checked ${results.length} daemons — ${healthy} healthy | ${summary}`);
}

async function main() {
  await registerDaemon("watchdog");
  log("daemon", `watchdog started, checking every ${INTERVAL_MIN} minutes`);
  while (true) {
    await cycle().catch((e) => log("cycle", `FATAL (continuing): ${e.message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main();
