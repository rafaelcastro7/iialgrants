// Continuous opportunity ingestion.
//
// The source-curator only ever ran when someone hit /api/public/hooks/source-*
// or pressed a button in the admin screen — nothing scheduled it, so the
// catalog went stale the moment a manual run finished. This daemon closes that
// loop: local-only, zero cloud tokens, safe to run unattended.
//
// Each cycle:
//   1. imports open US federal opportunities (Grants.gov Search2)
//   2. imports Canadian programs (Innovation Canada Business Benefits Finder)
//   3. expires grants whose deadline has passed
//   4. embeds whatever is new, so semantic search stays in step with the catalog
//
// Talks to Supabase over PostgREST rather than through scripts/daemon-shared.mjs:
// that helper imports `pg`, which is not a dependency of this project, so every
// daemon built on it dies at startup with ERR_MODULE_NOT_FOUND.
//
// Usage: node scripts/ingestion-daemon.mjs [intervalMinutes]   (default 360)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const ROOT = join(import.meta.dirname, "..");
const LOG = join(ROOT, "scripts", "ingestion-report.log");
const INTERVAL_MINUTES = Number(process.argv[2]) || 360;

// Mirror Vite/Bun precedence: .env first, then .env.local wins per key.
function loadEnv() {
  const merged = {};
  for (const file of [".env", ".env.local"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const hit = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (hit) merged[hit[1]] = hit[2];
    }
  }
  return merged;
}

const ENV = loadEnv();
const SUPABASE_URL = ENV.SUPABASE_URL || "http://localhost:15435";
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_PUBLISHABLE_KEY || "";

function log(section, message) {
  const line = `[${new Date().toISOString()}] [${section}] ${message}\n`;
  appendFileSync(LOG, line);
  console.log(line.trim());
}

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  return response;
}

async function runScript(label, relativePath, args = []) {
  const started = Date.now();
  try {
    const { stdout } = await execFileAsync("bun", ["run", relativePath, ...args], {
      cwd: ROOT,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
      shell: process.platform === "win32",
    });
    const summary = stdout
      .trim()
      .split("\n")
      .filter((line) => /upserted|created|parsed|usable|embedded|scanned/i.test(line))
      .join(" | ");
    log(label, `ok in ${Math.round((Date.now() - started) / 1000)}s — ${summary}`);
  } catch (error) {
    log(label, `FAILED — ${String(error.message ?? error).slice(0, 400)}`);
  }
}

// A grant past its deadline is not an opportunity any more. Without this the
// catalog only ever grows and /grants fills up with dead calls.
async function expirePastDeadlines() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await rest(
      `grants?deadline=lt.${today}&status=in.(discovered,enriched,scored,shortlisted)`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "expired" }),
      },
    );
    const rows = await response.json();
    log("expire", `marked ${rows.length} past-deadline grants expired`);
  } catch (error) {
    log("expire", `FAILED — ${String(error.message ?? error).slice(0, 300)}`);
  }
}

// grant_search_documents is keyed by grant_id and has no `id` column, so the
// counted column is per-table rather than assumed.
async function countOf(table, column = "id") {
  const response = await rest(`${table}?select=${column}`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return response.headers.get("content-range")?.split("/")[1] ?? "?";
}

async function cycle() {
  log("cycle", `start (every ${INTERVAL_MINUTES}m, target ${SUPABASE_URL})`);
  await runScript("grants-gov", "scripts/import-grants-gov-opportunities.ts", ["--limit=2000"]);
  await runScript("bbf", "scripts/import-bbf-opportunities.ts");
  await expirePastDeadlines();
  // Embedding runs last so it picks up everything the importers just wrote.
  await runScript("embeddings", "scripts/backfill-grant-search-embeddings.ts", ["--limit=4000"]);

  try {
    log(
      "state",
      `funders=${await countOf("funders")} grants=${await countOf("grants")} embedded=${await countOf("grant_search_documents", "grant_id")}`,
    );
  } catch (error) {
    log("state", `FAILED — ${String(error.message ?? error).slice(0, 300)}`);
  }
  log("cycle", "done");
}

await cycle();
setInterval(cycle, INTERVAL_MINUTES * 60 * 1000);
