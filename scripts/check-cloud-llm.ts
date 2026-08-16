/**
 * Probe the cloud LLM chain: are the keys valid, and do the models each agent
 * role is mapped to actually exist on this account?
 *
 * Model IDs on these providers are account- and date-specific — Cerebras has
 * already retired the llama* IDs this repo originally used, and Groq
 * deprecates models on a rolling basis. A mapped-but-retired model fails at
 * call time as a 404 buried inside an agent run, which is exactly the shape of
 * the ollama_prewarm_404 problem that silently degraded the critic.
 *
 * Usage: bun run scripts/check-cloud-llm.ts [--json]
 * Prints no key material.
 */

import {
  CEREBRAS_MODEL_MAP,
  GROQ_MODEL_MAP,
  GEMINI_MODEL_MAP,
} from "../src/agents/llm-cloud.server";

const JSON_OUT = process.argv.includes("--json");

type ProviderSpec = {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  keyName: string;
  models: Record<string, string>;
};

const PROVIDERS: ProviderSpec[] = [
  {
    name: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKey: process.env.CEREBRAS_API_KEY,
    keyName: "CEREBRAS_API_KEY",
    models: CEREBRAS_MODEL_MAP,
  },
  {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    keyName: "GROQ_API_KEY",
    models: GROQ_MODEL_MAP,
  },
  {
    name: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GOOGLE_AI_STUDIO_KEY,
    keyName: "GOOGLE_AI_STUDIO_KEY",
    models: GEMINI_MODEL_MAP,
  },
];

type ProviderReport = {
  provider: string;
  keyPresent: boolean;
  keyValid: boolean | null;
  detail: string;
  available: string[];
  mapped: string[];
  missing: string[];
  chat: Array<{ model: string; ok: boolean; ms: number; detail: string }>;
};

// Google returns ids as "models/gemini-2.5-flash" from /models but expects
// "gemini-2.5-flash" as the request model, so compare on the bare id.
const bareId = (id: string) => id.replace(/^models\//, "");

async function listModels(p: ProviderSpec): Promise<string[]> {
  const res = await fetch(`${p.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${p.apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}

/** One real round trip, so a valid key with a dead model still gets caught. */
async function probeChat(p: ProviderSpec, model: string) {
  const started = Date.now();
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ready" }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { model, ok: false, ms, detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return { model, ok: false, ms, detail: "HTTP 200 but empty content" };
    return { model, ok: true, ms, detail: text.slice(0, 40) };
  } catch (error) {
    return {
      model,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const reports: ProviderReport[] = [];

for (const p of PROVIDERS) {
  const mapped = [...new Set(Object.values(p.models))];
  const report: ProviderReport = {
    provider: p.name,
    keyPresent: !!p.apiKey,
    keyValid: null,
    detail: "",
    available: [],
    mapped,
    missing: [],
    chat: [],
  };

  if (!p.apiKey) {
    report.detail = `${p.keyName} is not set — provider skipped by the chain`;
    reports.push(report);
    continue;
  }

  try {
    report.available = await listModels(p);
    report.keyValid = true;
    const bare = new Set(report.available.map(bareId));
    report.missing = mapped.filter((m) => !bare.has(bareId(m)));
    report.detail = `${report.available.length} models on this account`;
  } catch (error) {
    // Gemini's OpenAI-compat surface does not always expose /models; the chat
    // probes below are the authoritative check either way.
    report.detail = `model list unavailable (${error instanceof Error ? error.message : String(error)})`;
  }

  // Probe every distinct mapped model, not just the first: the maps assign
  // different models per agent role, so a dead 70B model behind a healthy 8B
  // one would otherwise pass unnoticed.
  for (const model of mapped) {
    report.chat.push(await probeChat(p, model));
  }
  if (report.keyValid === null) report.keyValid = report.chat.some((c) => c.ok);
  reports.push(report);
}

if (JSON_OUT) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  console.log("\nCloud LLM chain — Cerebras -> Groq -> Gemini\n" + "=".repeat(64));
  for (const r of reports) {
    const status = !r.keyPresent ? "NO KEY" : r.keyValid ? "OK" : "FAIL";
    console.log(`\n[${status}] ${r.provider}`);
    console.log(`  ${r.detail}`);
    for (const c of r.chat) {
      console.log(`  chat ${c.model}: ${c.ok ? "ok" : "FAILED"} (${c.ms}ms) ${c.detail}`);
    }
    if (r.missing.length) {
      console.log(`  MAPPED BUT NOT ON ACCOUNT: ${r.missing.join(", ")}`);
    }
  }
  const usable = reports.filter(
    (r) => r.keyPresent && r.keyValid && !r.missing.length && r.chat.every((c) => c.ok),
  );
  console.log("\n" + "=".repeat(64));
  console.log(
    usable.length
      ? `${usable.length}/${reports.length} providers usable: ${usable.map((r) => r.provider).join(", ")}`
      : "NO usable cloud provider — every agent falls back to local Ollama",
  );
}

// Exit non-zero only when the whole chain is unusable: a single dead provider
// is survivable by design, no cloud at all is not (for a cloud deployment).
const anyUsable = reports.some((r) => r.keyPresent && r.keyValid && r.chat?.ok);
process.exit(anyUsable ? 0 : 1);
