#!/usr/bin/env node
// Live parallel audit daemon - runs continuously alongside normal work,
// using ONLY local resources (Ollama via local-audit.mjs + direct Postgres
// queries + plain HTTP/docker checks), zero cloud tokens. Three things per
// cycle:
//   1. Process health audit: is Ollama/dev-server/docker actually up and
//      responsive right now - catches a crashed/hung local process between
//      manual checks, not just code or data problems.
//   2. Code audit: any file touched by a commit since the last checkpoint
//      gets run through the local Ollama code-auditor (scripts/local-audit.mjs).
//   3. Data coherence audit: re-checks the live DB for the same anomaly
//      classes found manually this session (duplicate grant clusters,
//      stuck/never-pinned enrichments, orphaned test accounts, null-heavy
//      "enriched" rows) so drift gets caught between manual passes.
// Findings are appended to scripts/live-audit-report.log with a timestamp -
// check that file periodically; this script never modifies app code or data.
//
// Usage: node scripts/live-audit-daemon.mjs [intervalMinutes=10]

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync, rmSync } from "node:fs";
import { Client } from "pg";
import { getLoadTier, loadTierAllowsHeavyWork } from "./daemon-shared.mjs";

const INTERVAL_MIN = Number(process.argv[2]) || 10;
const STATE_FILE = "scripts/.live-audit-state.json";
const LOG_FILE = "scripts/live-audit-report.log";
const LOCAL_AUDIT_REPORT = "scripts/.local-audit-report.json";
const DB_URL =
  "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres";

function log(section, message) {
  const line = `[${new Date().toISOString()}] [${section}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf8"));
    } catch {
      // fall through to default
    }
  }
  return { lastCommit: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function currentCommit() {
  return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
}

function changedFilesSince(lastCommit) {
  if (!lastCommit) return [];
  try {
    const out = execSync(`git diff --name-only ${lastCommit} HEAD`, { encoding: "utf8" });
    return out
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && existsSync(f));
  } catch (e) {
    log("code-audit", `git diff failed: ${e.message}`);
    return [];
  }
}

async function runCodeAudit(state) {
  const head = currentCommit();
  if (head === state.lastCommit) {
    log("code-audit", "no new commits since last cycle");
    return;
  }
  const files = changedFilesSince(state.lastCommit);
  if (files.length === 0) {
    log("code-audit", `commit advanced (${head.slice(0, 8)}) but no auditable .ts/.tsx changes`);
    state.lastCommit = head;
    delete state.pendingAuditCommit;
    delete state.auditedFilesForCommit;
    return;
  }

  // Heavy GPU work: skip (don't advance the checkpoint) if the GPU is busy or
  // the circuit is open, so a foreground pipeline run isn't starved. Earlier
  // this ran ungated and spent ~248s/file fighting for the GPU.
  const tier = await getLoadTier();
  if (tier.circuitOpen || !loadTierAllowsHeavyWork(tier.loadTier)) {
    log(
      "code-audit",
      `deferring ${files.length} changed file(s) - GPU busy (loadTier=${tier.loadTier}${tier.circuitOpen ? ", circuit open" : ""}); will retry next cycle`,
    );
    return; // leave state.lastCommit unchanged so we re-attempt when idle
  }

  // Cap 3/cycle with a 4-min/file ceiling so one cycle can't balloon past the
  // poll interval. Findings are an UNVERIFIED local-7B heuristic (it over-
  // reports races/nulls) - logged for triage, never treated as ground truth,
  // and excluded from the Autonomy tab's feed + improvement signal.
  if (state.pendingAuditCommit !== head) {
    state.pendingAuditCommit = head;
    state.auditedFilesForCommit = [];
  }
  const alreadyAudited = new Set(state.auditedFilesForCommit || []);
  const remaining = files.filter((file) => !alreadyAudited.has(file));
  if (remaining.length === 0) {
    log("code-audit", `completed audit for ${head.slice(0, 8)} (${files.length} file(s))`);
    state.lastCommit = head;
    delete state.pendingAuditCommit;
    delete state.auditedFilesForCommit;
    return;
  }

  const batch = remaining.slice(0, 3);
  log(
    "code-audit",
    `auditing ${batch.length}/${remaining.length} remaining changed file(s): ${batch.join(", ")}`,
  );
  for (const file of batch) {
    rmSync(LOCAL_AUDIT_REPORT, { force: true });
    const res = spawnSync("node", ["scripts/local-audit.mjs", "qwen2.5-coder:7b", file], {
      encoding: "utf8",
      timeout: 4 * 60 * 1000,
      env: { ...process.env, LOCAL_AUDIT_REPORT },
    });
    if (res.error) {
      log("code-audit", `${file} -> auditor error: ${res.error.message}`);
      continue;
    }
    try {
      const report = JSON.parse(readFileSync(LOCAL_AUDIT_REPORT, "utf8"));
      const real = (report.results || []).filter((r) => !r.error && (r.findings || []).length > 0);
      const findingCount = real.reduce((n, r) => n + (r.findings || []).length, 0);
      log(
        "code-audit",
        findingCount > 0
          ? `${file} -> ${findingCount} unverified heuristic finding(s) (triage before acting)`
          : `${file} -> no heuristic findings`,
      );
    } catch {
      log("code-audit", `${file} -> auditor produced no parseable report`);
    }
  }
  state.auditedFilesForCommit = [...new Set([...(state.auditedFilesForCommit || []), ...batch])];
  if (state.auditedFilesForCommit.length >= files.length) {
    state.lastCommit = head;
    delete state.pendingAuditCommit;
    delete state.auditedFilesForCommit;
  } else {
    log(
      "code-audit",
      `checkpoint retained; ${files.length - state.auditedFilesForCommit.length} file(s) remain for ${head.slice(0, 8)}`,
    );
  }
}

async function checkHttp(name, url, timeoutMs = 4000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = Date.now();
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const ms = Date.now() - start;
    if (!res.ok) {
      log("process-health", `DOWN: ${name} (${url}) responded HTTP ${res.status}`);
    } else if (ms > 2000) {
      log("process-health", `SLOW: ${name} (${url}) took ${ms}ms to respond`);
    }
    return res.ok;
  } catch (e) {
    log("process-health", `DOWN: ${name} (${url}) unreachable - ${e.message}`);
    return false;
  }
}

async function runProcessHealthAudit() {
  await checkHttp("dev server", "http://localhost:8080");
  await checkHttp("Ollama", "http://localhost:11434/api/tags");
  await checkHttp("Ollama proxy", "http://localhost:11435/proxy-health");

  try {
    const out = execSync('docker ps --filter "name=docker-" --format "{{.Names}}\\t{{.Status}}"', {
      encoding: "utf8",
    }).trim();
    const lines = out ? out.split("\n") : [];
    const expected = ["docker-kong-1", "docker-db-1", "docker-auth-1", "docker-rest-1"];
    const runningNames = lines.map((l) => l.split("\t")[0]);
    const missing = expected.filter((n) => !runningNames.includes(n));
    if (missing.length > 0) {
      log(
        "process-health",
        `DOWN: expected Supabase containers not running: ${missing.join(", ")}`,
      );
    }
    const unhealthy = lines.filter((l) => /unhealthy|restarting|exited/i.test(l));
    if (unhealthy.length > 0) {
      log("process-health", `UNHEALTHY containers: ${unhealthy.join(" | ")}`);
    }
  } catch (e) {
    log("process-health", `docker ps check failed: ${e.message}`);
  }
}

async function runDataAudit() {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();

    // 1. Duplicate grant clusters (funder_id + normalized title), same class
    // as the 16-row IRAP contamination found earlier this session.
    const dupes = await client.query(`
      select funder_id, lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) as norm_title, count(*) as n
      from grants
      where status <> 'archived'
      group by funder_id, norm_title
      having count(*) > 1
    `);
    if (dupes.rows.length > 0) {
      log("data-audit", `DUPLICATE CLUSTERS (active, non-archived): ${JSON.stringify(dupes.rows)}`);
    }

    // 2. Grants stuck at max attempts with no confirmed_source_urls pinned
    // (candidates that would benefit from a retry now that pinning exists).
    const stuck = await client.query(`
      select id, title, enrich_attempts
      from grants
      where status = 'discovered' and enrich_attempts >= 3 and confirmed_source_urls is null
    `);
    if (stuck.rows.length > 0) {
      log(
        "data-audit",
        `${stuck.rows.length} grant(s) stuck at max attempts with nothing pinned: ${stuck.rows.map((r) => r.title).join(", ")}`,
      );
    }

    // 3. Orphaned test-seed accounts recurring (same bug class as the 19
    // fake live-pilot-* accounts cleaned up earlier).
    const fakeUsers = await client.query(
      `select count(*) from auth.users where email like 'live-pilot-%@iial.test'`,
    );
    if (Number(fakeUsers.rows[0].count) > 0) {
      log(
        "data-audit",
        `WARNING: ${fakeUsers.rows[0].count} fresh "live-pilot-*" test account(s) detected again - seed-live-grant.mjs idempotency fix may have regressed, or a different path is creating them.`,
      );
    }

    // 4. "Enriched"/"scored" grants with implausible amounts (same sanity
    // bound used in the Kanban badge fix) - a canary for extraction drift.
    const implausible = await client.query(`
      select id, title, amount_cad_max
      from grants
      where status in ('enriched','scored') and amount_cad_max is not null
        and (amount_cad_max < 1000 or amount_cad_max > 50000000)
    `);
    if (implausible.rows.length > 0) {
      log("data-audit", `IMPLAUSIBLE AMOUNTS: ${JSON.stringify(implausible.rows)}`);
    }

    // 5. Fabricated ungrounded requirements: the two low-precision detectors
    // removed in commit decf550 ("Must be registered as: X" / "Financial
    // documentation required") wrote isCritical requirements from bare
    // keyword co-occurrence with no snippet grounding, wrongly blocking
    // submission. Removed from code + 24 stored records cleaned on
    // 2026-07-11; this catches a regression if either resurfaces.
    const fabricated = await client.query(`
      select id, title from grants
      where requirements::text ilike '%Must be registered as:%'
         or requirements::text ilike '%Financial documentation required%'
    `);
    if (fabricated.rows.length > 0) {
      log(
        "data-audit",
        `FABRICATED REQUIREMENTS RESURFACED (${fabricated.rows.length}): ${fabricated.rows.map((r) => r.title).join(", ")}`,
      );
    }

    if (
      dupes.rows.length === 0 &&
      stuck.rows.length === 0 &&
      Number(fakeUsers.rows[0].count) === 0 &&
      implausible.rows.length === 0 &&
      fabricated.rows.length === 0
    ) {
      log("data-audit", "clean - no new anomalies of the known classes");
    }
  } catch (e) {
    log("data-audit", `ERROR: ${e.message}`);
  } finally {
    await client.end();
  }
}

async function cycle() {
  const state = loadState();
  log("cycle", "--- starting audit cycle ---");
  await runProcessHealthAudit();
  await runCodeAudit(state);
  await runDataAudit();
  saveState(state);
  log("cycle", `--- cycle done, sleeping ${INTERVAL_MIN}m ---`);
}

async function main() {
  log("daemon", `live-audit-daemon started, polling every ${INTERVAL_MIN} minutes`);
  while (true) {
    await cycle().catch((e) => log("cycle", `FATAL (continuing): ${e.message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main();
