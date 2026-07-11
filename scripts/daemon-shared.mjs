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
// failure so callers can decide whether to skip the cycle.
export async function ollamaChat(
  model,
  messages,
  { timeoutMs = 120000, numCtx = 4096, numPredict = 512 } = {},
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        // num_predict caps output — without it a small model can run away
        // generating tokens on a structured-output prompt until the timeout.
        options: { num_ctx: numCtx, num_predict: numPredict, temperature: 0.2 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const body = await res.json();
    return body?.message?.content ?? "";
  } finally {
    clearTimeout(t);
  }
}

// Heavy LLM call that self-suppresses when the GPU is busy or the circuit is
// open. Returns { skipped: true, reason } instead of throwing so a daemon
// cycle degrades gracefully to "measure now, reason later".
export async function ollamaChatWhenIdle(preferredModel, messages, opts = {}) {
  const tier = await getLoadTier();
  if (tier.circuitOpen) return { skipped: true, reason: "circuit_open" };
  if (!loadTierAllowsHeavyWork(tier.loadTier)) {
    return { skipped: true, reason: `load_tier_${tier.loadTier}` };
  }
  try {
    const text = await ollamaChat(preferredModel, messages, opts);
    return { skipped: false, text, loadTier: tier.loadTier };
  } catch (e) {
    return { skipped: true, reason: e instanceof Error ? e.message : String(e) };
  }
}

// Round to keep JSONL metric rows compact and comparable.
export function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}
