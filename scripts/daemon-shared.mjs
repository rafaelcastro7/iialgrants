// Shared helpers for the local self-improvement daemons (audit / self-eval /
// improvement). Everything here is local-only and zero-cloud-token: direct
// Postgres + Ollama, coordinated through the Ollama proxy's loadTier signal so
// the daemons back off instead of fighting the GPU with a foreground batch run
// (the exact contention that made local-audit useless earlier this session).

import { appendFileSync } from "node:fs";
import { Client } from "pg";

export const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres";

const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const PROXY = process.env.OLLAMA_PROXY_URL || "http://localhost:11435";

export function stamp() {
  return new Date().toISOString();
}

export function logTo(file, section, message) {
  const line = `[${stamp()}] [${section}] ${message}\n`;
  appendFileSync(file, line);
  console.log(line.trim());
}

export async function withPg(fn) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Ask the Ollama proxy how loaded the GPU is right now. Returns a normalized
// shape even when the proxy is unreachable (treat unknown as "don't run heavy
// work" to stay conservative).
export async function getLoadTier(timeoutMs = 4000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${PROXY}/proxy-health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { loadTier: "unknown", recommendedModel: null, ok: false };
    const body = await res.json();
    return {
      loadTier: body?.routing?.loadTier ?? "unknown",
      recommendedModel: body?.routing?.recommendedModel ?? null,
      circuitOpen: !!body?.circuit?.open,
      ok: true,
    };
  } catch {
    return { loadTier: "unknown", recommendedModel: null, ok: false };
  }
}

// True only when it's safe to spend real GPU time on a heavy LLM call.
export function loadTierAllowsHeavyWork(tier) {
  return tier === "low" || tier === "normal" || tier === "medium";
}

// Single-shot, non-streaming Ollama chat with a hard timeout. Throws on any
// failure so callers can decide whether to skip the cycle. keepAlive keeps the
// model resident after the call so the next cycle doesn't pay the full cold
// load again (a ~77s penalty on this Pascal GPU).
export async function ollamaChat(
  model,
  messages,
  { timeoutMs = 120000, numCtx = 4096, numPredict = 512, keepAlive = "15m" } = {},
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // STREAM the response. A non-streaming call returns headers only when the
    // whole generation is done, so a >5-min cold-load+generation trips undici's
    // 300s headersTimeout ("fetch failed") regardless of our own AbortController.
    // Streaming delivers headers at the first token, so only our timeout bounds
    // total time. (Same reason the writer agent streams slow Ollama calls.)
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        keep_alive: keepAlive,
        // num_predict caps output — without it a small model can run away
        // generating tokens on a structured-output prompt until the timeout.
        options: { num_ctx: numCtx, num_predict: numPredict, temperature: 0.2 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`ollama HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the incomplete trailing line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj;
        try {
          obj = JSON.parse(trimmed);
        } catch {
          continue; // ignore a partial/garbled chunk
        }
        if (obj.error) throw new Error(`ollama: ${obj.error}`);
        if (obj.message?.content) content += obj.message.content;
      }
    }
    return content;
  } finally {
    clearTimeout(t);
  }
}

// A cross-process file lock so the daemons take turns on the GPU instead of
// thrashing it by loading multiple ~5GB models at once (the real cause of the
// improvement daemon's repeated 240s aborts). Cooperative: honored only by
// code that calls acquireGpuLock. Steals a lock older than staleMs (a crashed
// holder must never wedge the GPU forever).
const GPU_LOCK = "scripts/.gpu.lock";

export async function acquireGpuLock({ maxWaitMs = 45000, staleMs = 360000, holder = "?" } = {}) {
  const { writeFileSync, readFileSync, existsSync, statSync, unlinkSync } = await import("node:fs");
  const start = Date.now();
  for (;;) {
    try {
      writeFileSync(GPU_LOCK, `${holder} ${new Date().toISOString()}`, { flag: "wx" });
      return true;
    } catch {
      // Lock exists — steal it if stale, else wait.
      try {
        if (existsSync(GPU_LOCK) && Date.now() - statSync(GPU_LOCK).mtimeMs > staleMs) {
          unlinkSync(GPU_LOCK);
          continue;
        }
      } catch {
        // race on stat/unlink — just retry
      }
      if (Date.now() - start > maxWaitMs) return false;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

export async function releaseGpuLock() {
  try {
    const { unlinkSync, existsSync } = await import("node:fs");
    if (existsSync(GPU_LOCK)) unlinkSync(GPU_LOCK);
  } catch {
    // ignore
  }
}

// Heavy LLM call that self-suppresses when the GPU is busy or the circuit is
// open, and serializes against the other daemons via the GPU lock. Returns
// { skipped: true, reason } instead of throwing so a daemon cycle degrades
// gracefully to "measure now, reason later".
export async function ollamaChatWhenIdle(preferredModel, messages, opts = {}) {
  const tier = await getLoadTier();
  if (tier.circuitOpen) return { skipped: true, reason: "circuit_open" };
  if (!loadTierAllowsHeavyWork(tier.loadTier)) {
    return { skipped: true, reason: `load_tier_${tier.loadTier}` };
  }
  const got = await acquireGpuLock({ holder: opts.holder ?? preferredModel });
  if (!got) return { skipped: true, reason: "gpu_lock_busy" };
  try {
    const text = await ollamaChat(preferredModel, messages, opts);
    return { skipped: false, text, loadTier: tier.loadTier };
  } catch (e) {
    return { skipped: true, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    await releaseGpuLock();
  }
}

// --- Daemon process registry (for the watchdog's restart logic) -------------

const PID_DIR = "scripts/.pids";

export async function registerDaemon(key) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  try {
    mkdirSync(PID_DIR, { recursive: true });
    writeFileSync(`${PID_DIR}/${key}.pid`, String(process.pid));
  } catch {
    // non-fatal — the watchdog falls back to log-freshness if no pid file
  }
}

export async function readDaemonPid(key) {
  const { readFileSync, existsSync } = await import("node:fs");
  try {
    if (!existsSync(`${PID_DIR}/${key}.pid`)) return null;
    const pid = Number(readFileSync(`${PID_DIR}/${key}.pid`, "utf8").trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't kill
    return true;
  } catch (e) {
    return e.code === "EPERM"; // exists but not ours
  }
}

// Round to keep JSONL metric rows compact and comparable.
export function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}
