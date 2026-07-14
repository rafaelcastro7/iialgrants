#!/usr/bin/env node
// Daemon supervisor: keeps the local self-improvement daemon fleet alive.
// It is safe to start more than once: existing live daemon PIDs are reused
// instead of spawning duplicates.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const SUPERVISOR_LOG = "scripts/daemon-supervisor.log";
const SUPERVISOR_PID = "scripts/.supervisor.pid";
const PID_DIR = "scripts/.pids";
const MAX_RESTARTS_PER_HOUR = 6;
const CHECK_INTERVAL_MS = 30_000;

const DAEMONS = [
  { key: "audit", script: "scripts/live-audit-daemon.mjs", interval: 15 },
  { key: "self-eval", script: "scripts/self-eval-daemon.mjs", interval: 30 },
  { key: "improvement", script: "scripts/improvement-daemon.mjs", interval: 45 },
  { key: "self-criticism", script: "scripts/self-criticism-daemon.mjs", interval: 60 },
  { key: "watchdog", script: "scripts/daemon-watchdog.mjs", interval: 5 },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    writeFileSync(SUPERVISOR_LOG, line, { flag: "a" });
  } catch {
    // ignore log write errors
  }
}

function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function pidFile(key) {
  return `${PID_DIR}/${key}.pid`;
}

function readPid(key) {
  try {
    if (!existsSync(pidFile(key))) return null;
    const pid = Number(readFileSync(pidFile(key), "utf8").trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function startDaemon(daemon) {
  const child = spawn(process.execPath, [daemon.script, String(daemon.interval)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  log(`Started ${daemon.key} (pid ${child.pid}, interval ${daemon.interval}m)`);
  return child.pid;
}

function recentRestartCount(state, key) {
  const cutoff = Date.now() - 3600_000;
  const restarts = (state.restarts[key] || []).filter((ts) => Date.parse(ts) > cutoff);
  state.restarts[key] = restarts;
  return restarts.length;
}

function markRestart(state, key) {
  state.restarts[key] = state.restarts[key] || [];
  state.restarts[key].push(new Date().toISOString());
}

function ensureDaemon(daemon, state, { initial = false } = {}) {
  const pid = readPid(daemon.key);
  if (isProcessAlive(pid)) {
    if (initial) log(`Reusing ${daemon.key} (pid ${pid})`);
    return pid;
  }

  const recent = recentRestartCount(state, daemon.key);
  if (!initial && recent >= MAX_RESTARTS_PER_HOUR) {
    log(`${daemon.key}: too many restarts this hour (${recent}); manual intervention required.`);
    return null;
  }

  if (!initial) log(`${daemon.key} is not alive (pid was ${pid ?? "none"}); restarting.`);
  const newPid = startDaemon(daemon);
  if (!initial) markRestart(state, daemon.key);
  return newPid;
}

async function main() {
  ensureDir(PID_DIR);
  writeFileSync(SUPERVISOR_PID, String(process.pid));

  log(`Supervisor started (pid ${process.pid}). Monitoring ${DAEMONS.length} daemons.`);
  const state = { restarts: {} };

  for (const daemon of DAEMONS) {
    ensureDaemon(daemon, state, { initial: true });
  }

  setInterval(() => {
    for (const daemon of DAEMONS) {
      ensureDaemon(daemon, state);
    }
  }, CHECK_INTERVAL_MS);

  process.on("SIGTERM", () => {
    log("Supervisor shutting down (SIGTERM). Child daemons continue detached.");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("Supervisor shutting down (SIGINT). Child daemons continue detached.");
    process.exit(0);
  });
}

main().catch((e) => {
  log(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
