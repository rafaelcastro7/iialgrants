import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SUPABASE_URL = "http://localhost:15435";
const DEFAULT_DEV_URL = "http://localhost:8080";
const DEFAULT_DB_HOST = "localhost";
const DEFAULT_DB_PORT = 15432;

const REQUIRED_CORS_HEADERS = [
  "apikey",
  "x-client-info",
  "x-supabase-api-version",
  "x-retry-count",
  "accept-profile",
  "content-profile",
];

const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
}

async function loadDotEnv() {
  try {
    const raw = await readFile(".env", "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const idx = line.indexOf("=");
          return [line.slice(0, idx), line.slice(idx + 1).replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

async function checkGit() {
  try {
    const [{ stdout: inside }, { stdout: branch }, { stdout: remote }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--is-inside-work-tree"]),
      execFileAsync("git", ["branch", "--show-current"]),
      execFileAsync("git", ["remote", "-v"]),
    ]);

    if (inside.trim() !== "true") {
      fail("git repository", "current directory is not inside a git worktree");
      return;
    }

    pass("git repository", `branch=${branch.trim() || "(detached)"}`);

    if (remote.trim()) {
      pass("git remote", remote.trim().split(/\r?\n/)[0]);
    } else {
      fail("git remote", "no remote configured; add one before sharing or backing up work");
    }
  } catch (error) {
    fail("git repository", error.message);
  }
}

async function checkTcp(host, port, name) {
  await new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 3000 });
    socket.once("connect", () => {
      socket.destroy();
      pass(name, `${host}:${port} accepts TCP connections`);
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      fail(name, `${host}:${port} timed out`);
      resolve();
    });
    socket.once("error", (error) => {
      fail(name, `${host}:${port} ${error.code || error.message}`);
      resolve();
    });
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHttp(url, name) {
  try {
    const response = await fetchWithTimeout(url, { timeoutMs: 5000 });
    if (response.ok) {
      pass(name, `${url} -> ${response.status}`);
    } else {
      fail(name, `${url} -> ${response.status}`);
    }
  } catch (error) {
    fail(name, `${url} ${error.name === "AbortError" ? "timed out" : error.message}`);
  }
}

async function checkCors(supabaseUrl, devUrl) {
  const origin = new URL(devUrl).origin;
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "OPTIONS",
      timeoutMs: 5000,
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": REQUIRED_CORS_HEADERS.join(","),
      },
    });

    const allowOrigin = response.headers.get("access-control-allow-origin") || "";
    const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
    const missingHeaders = REQUIRED_CORS_HEADERS.filter((header) => !allowHeaders.includes(header));

    if (response.ok && allowOrigin === origin && missingHeaders.length === 0) {
      pass("Kong CORS preflight", `${response.status}; origin and Supabase headers allowed`);
    } else {
      fail(
        "Kong CORS preflight",
        `status=${response.status}; allow-origin=${allowOrigin || "(missing)"}; missing-headers=${missingHeaders.join(",") || "none"}`,
      );
    }
  } catch (error) {
    fail("Kong CORS preflight", error.name === "AbortError" ? "timed out" : error.message);
  }
}

async function checkPostgrest(supabaseUrl, anonKey) {
  if (!anonKey) {
    fail(
      "PostgREST via Kong",
      "missing SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY in .env",
    );
    return;
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/grants?select=id&limit=1`;
  try {
    const response = await fetchWithTimeout(url, {
      timeoutMs: 5000,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (response.ok) {
      pass("PostgREST via Kong", `${response.status}; grants endpoint reachable`);
    } else {
      const body = await response.text();
      fail("PostgREST via Kong", `${response.status}; ${body.slice(0, 160)}`);
    }
  } catch (error) {
    fail("PostgREST via Kong", error.name === "AbortError" ? "timed out" : error.message);
  }
}

async function checkDockerCompose() {
  try {
    const { stdout } = await execFileAsync("docker", ["compose", "ps", "--format", "json"], {
      cwd: "supabase/docker",
    });

    const rows = stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const services = new Map(rows.map((row) => [row.Service, row.State]));
    const required = ["db", "auth", "rest", "kong"];
    const down = required.filter((service) => services.get(service) !== "running");

    if (down.length === 0) {
      pass("docker compose services", "db, auth, rest, and kong are running");
    } else {
      fail("docker compose services", `not running: ${down.join(", ")}`);
    }
  } catch (error) {
    fail("docker compose services", error.message);
  }
}

function printResults() {
  for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    console.log(`${mark} ${result.name}: ${result.detail}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.log("");
    console.log("Suggested repair:");
    console.log("  cd supabase/docker");
    console.log("  docker compose up -d --force-recreate kong");
    console.log("  docker compose restart auth rest");
    console.log("  cd ../..");
    console.log("  bun run check:local");
    process.exitCode = 1;
  }
}

const env = await loadDotEnv();
const supabaseUrl =
  process.env.SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const devUrl = process.env.DEV_URL || env.DEV_URL || DEFAULT_DEV_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY;

await checkGit();
await checkDockerCompose();
await checkTcp(DEFAULT_DB_HOST, DEFAULT_DB_PORT, "Postgres port");
await checkHttp(devUrl, "dev server");
await checkCors(supabaseUrl, devUrl);
await checkPostgrest(supabaseUrl, anonKey);
printResults();
