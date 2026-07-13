#!/usr/bin/env node
// Daemon Supervisor — keeps all construction daemons alive 24/7.
// Runs as a persistent background process that restarts dead daemons.
// On machine restart, this supervisor auto-starts via Task Scheduler / systemd.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPERVISOR_LOG = "scripts/daemon-supervisor.log";
const SUPERVISOR_PID = "scripts/.supervisor.pid";
const DAEMONS = [
  { key: "audit", script: "scripts/live-audit-daemon.mjs", interval: 15 },
  { key: "self-eval", script: "scripts/self-eval-daemon.mjs", interval: 30 },
  { key: "improvement", script: "scripts/improvement-daemon.mjs", interval: 45 },
  { key: "self-criticism", script: "scripts/self-criticism-daemon.mjs", interval: 60 },
  { key: "watchdog", script: "scripts/daemon-watchdog.mjs", interval: 5 },
];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  process.stdout.write(line);
  try {
    writeFileSync(SUPERVISOR_LOG, line, { flag: "a" });
  } catch {
    // ignore log write errors
  }
}

async function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

async function main() {
  await ensureDir("scripts/.pids");
  writeFileSync(SUPERVISOR_PID, String(process.pid));

  log(`Supervisor started (pid ${process.pid}). Monitoring ${DAEMONS.length} daemons.`);

  const children = new Map();

  // Start all daemons initially
  for (const daemon of DAEMONS) {
    const child = spawn("node", [daemon.script], { detached: true, stdio: "ignore" });
    child.unref();
    children.set(daemon.key, { pid: child.pid, attempts: 0 });
    log(`Started ${daemon.key} (pid ${child.pid})`);
  }

  // Monitor loop: check every 30 seconds if any daemon died
  setInterval(async () => {
    for (const daemon of DAEMONS) {
      const entry = children.get(daemon.key);
      if (!entry) continue;

      const pidFile = `scripts/.pids/${daemon.key}.pid`;
      let currentPid = null;
      try {
        currentPid = Number(readFileSync(pidFile, "utf8").trim());
      } catch {
        // PID file doesn't exist yet
      }

      // Check if process is alive
      const isAlive = currentPid ? isProcessAlive(currentPid) : false;

      if (!isAlive) {
        entry.attempts++;
        log(
          `${daemon.key} is DEAD (pid was ${currentPid}). Attempt #${entry.attempts} to restart.`
        );

        // Rate limit: don't restart more than 6x per hour
        if (entry.attempts >= 6 && entry.lastRestartHour === new Date().getHours()) {
          log(
            `${daemon.key}: TOO MANY RESTARTS this hour (${entry.attempts}). Giving up until next hour.`
          );
          continue;
        }

        // Restart the daemon
        const child = spawn("node", [daemon.script], { detached: true, stdio: "ignore" });
        child.unref();
        children.set(daemon.key, { pid: child.pid, attempts: 0, lastRestartHour: new Date().getHours() });
        log(`Restarted ${daemon.key} (new pid ${child.pid})`);
      }
    }
  }, 30_000); // Check every 30 seconds

  // Graceful shutdown
  process.on("SIGTERM", () => {
    log("Supervisor shutting down (SIGTERM). Child daemons will continue (detached).");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("Supervisor shutting down (SIGINT). Child daemons will continue (detached).");
    process.exit(0);
  });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // EPERM = exists but not ours
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
