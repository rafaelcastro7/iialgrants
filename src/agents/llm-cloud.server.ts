// Cloud LLM adapter — the app's INITIAL source everywhere (dev + Lovable prod).
// Cloud chain: Cerebras (primary) -> Groq (secondary). Both are OpenAI-compatible.
// callLlm/callFreeLlm fall back to local Ollama only if this whole chain fails
// (e.g. no cloud keys set), so the dev machine still works fully offline.
//
// Model mapping mirrors local agent roles:
//   discoverer/enricher → fast 8B model  (structured extraction, high volume)
//   evaluator/critic    → 70B model      (honest evaluation)
//   strategist/writer   → 70B model      (deep reasoning)

import { logGenAI, newRunId } from "@/lib/otel";
import type { AgentName } from "@/lib/agent-config.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CloudLlmOptions = {
  agent: AgentName;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "json";
  runId?: string;
  // Optional schema guard: return true if the response text is usable. When a
  // provider returns HTTP 200 but content that fails the agent's schema (e.g.
  // Cerebras gemma-4-31b omitting required fields for the critic), the chain
  // falls through to the next provider (Groq/Gemini) instead of surfacing a
  // broken response. Callers pass their Zod parse as this guard.
  validate?: (text: string) => boolean;
};

export type CloudLlmResult = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  runId: string;
  provider: string;
  model: string;
};

type CloudProvider = {
  name: "cerebras" | "groq" | "gemini";
  baseUrl: string;
  apiKey: string | undefined;
  modelMap: Record<AgentName, string>;
};

// Cerebras — primary cloud source ("los cerebros"). OpenAI-compatible API.
// Model IDs are account-specific; verify with `GET /v1/models`. This account
// exposes gemma-4-31b, gpt-oss-120b, zai-glm-4.7 (the older llama* IDs 404).
// Only gemma-4-31b returns valid structured JSON via the OpenAI-compat endpoint:
// gpt-oss-120b truncates (harmony/reasoning tokens) → "Unexpected end of JSON
// input"; zai-glm-4.7 returns empty content. So all agents use gemma-4-31b here;
// heavier reasoning falls through to Groq llama-3.3-70b next in the chain.
export const CEREBRAS_MODEL_MAP: Record<AgentName, string> = {
  discoverer: "gemma-4-31b",
  enricher: "gemma-4-31b",
  evaluator: "gemma-4-31b",
  strategist: "gemma-4-31b",
  writer: "gemma-4-31b",
  critic: "gemma-4-31b",
};

// Groq — secondary cloud source (free tier) if Cerebras is unavailable.
export const GROQ_MODEL_MAP: Record<AgentName, string> = {
  discoverer: "llama-3.1-8b-instant",
  enricher: "llama-3.1-8b-instant",
  evaluator: "llama-3.3-70b-versatile",
  strategist: "llama-3.3-70b-versatile",
  writer: "llama-3.3-70b-versatile",
  critic: "llama-3.3-70b-versatile",
};

// Gemini — tertiary cloud source via Google's OpenAI-compatible endpoint.
//
// The 2.0 IDs this used to name (gemini-2.0-flash / -flash-lite) were retired
// by Google and answer 404 "no longer available"; the whole tertiary rung was
// therefore dead, and a Cerebras+Groq outage fell straight through to local
// Ollama. Confirmed live 2026-08-16 against this account's model list.
// Pinned rather than tracking the -latest aliases so behaviour is stable;
// `bun run scripts/check-cloud-llm.ts` catches the next retirement.
export const GEMINI_MODEL_MAP: Record<AgentName, string> = {
  discoverer: "gemini-2.5-flash-lite",
  enricher: "gemini-2.5-flash-lite",
  evaluator: "gemini-2.5-flash",
  strategist: "gemini-2.5-flash",
  writer: "gemini-2.5-flash",
  critic: "gemini-2.5-flash",
};

// Cloud chain order: Cerebras -> Groq -> Gemini. Providers with no API key are
// skipped. If the whole chain fails or has no keys, callLlm/callFreeLlm fall
// back to local Ollama, so the system is hybrid cloud+local end to end.
function cloudProviders(): CloudProvider[] {
  return [
    {
      name: "cerebras",
      baseUrl: "https://api.cerebras.ai/v1",
      apiKey: process.env.CEREBRAS_API_KEY,
      modelMap: CEREBRAS_MODEL_MAP,
    },
    {
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      modelMap: GROQ_MODEL_MAP,
    },
    {
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: process.env.GOOGLE_AI_STUDIO_KEY,
      modelMap: GEMINI_MODEL_MAP,
    },
  ];
}

/**
 * Returns true when we are running in a cloud environment where Ollama
 * is not available (no OLLAMA_BASE_URL pointing to a real server).
 * In practice: Lovable preview / production → Ollama not reachable.
 */
export function isCloudEnvironment(): boolean {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  // If OLLAMA_BASE_URL points to localhost we are almost certainly NOT in
  // a cloud container — but callers also check connectivity directly.
  return ollamaUrl.includes("localhost") && !!process.env.GROQ_API_KEY;
}

/**
 * Probes Ollama with a 3-second timeout.
 * Returns true when Ollama is reachable, false when it is not (cloud env).
 */
let _ollamaReachableCache: { value: boolean; expires: number } | null = null;

export async function isOllamaReachable(): Promise<boolean> {
  if (_ollamaReachableCache && _ollamaReachableCache.expires > Date.now()) {
    return _ollamaReachableCache.value;
  }
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    const reachable = res.ok;
    _ollamaReachableCache = { value: reachable, expires: Date.now() + 30_000 };
    return reachable;
  } catch {
    _ollamaReachableCache = { value: false, expires: Date.now() + 30_000 };
    return false;
  }
}

async function callOpenAICompat(
  provider: CloudProvider,
  opts: CloudLlmOptions,
  runId: string,
): Promise<CloudLlmResult> {
  const model = provider.modelMap[opts.agent] ?? provider.modelMap.discoverer;
  const t0 = Date.now();
  let ok = false;
  let errMsg: string | undefined;

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxOutputTokens ?? 2048,
  };
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`${provider.name}_error_${res.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const inputTokens: number | undefined = data?.usage?.prompt_tokens;
    const outputTokens: number | undefined = data?.usage?.completion_tokens;
    ok = true;

    return { text, inputTokens, outputTokens, runId, provider: provider.name, model };
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    logGenAI({
      "gen_ai.system": provider.name,
      "gen_ai.request.model": model,
      "gen_ai.operation.name": "chat",
      latency_ms: Date.now() - t0,
      agent: opts.agent,
      run_id: runId,
      ok,
      error: errMsg,
    });
  }
}

/**
 * Main cloud entrypoint — mirrors callLlm / callFreeLlm signatures.
 * Tries the cloud chain in order (Cerebras -> Groq), skipping providers with
 * no API key. Throws `cloud_llm_unavailable` only when NO provider has a key,
 * so the router falls back to local Ollama. If keys exist but every provider
 * errors, the last provider error is surfaced.
 */
export async function callCloudLlm(opts: CloudLlmOptions): Promise<CloudLlmResult> {
  const runId = opts.runId ?? newRunId();
  const providers = cloudProviders().filter((p) => !!p.apiKey);

  if (providers.length === 0) {
    throw new Error(
      "cloud_llm_unavailable: no cloud LLM key set (CEREBRAS_API_KEY / GROQ_API_KEY). " +
        "Add one to your Lovable environment variables (Settings → Environment Variables).",
    );
  }

  let lastErr: unknown;
  for (const provider of providers) {
    try {
      const result = await callOpenAICompat(provider, opts, runId);
      if (opts.validate && !opts.validate(result.text)) {
        lastErr = new Error(`${provider.name}_output_failed_validation`);
        console.warn(
          `[Cloud LLM] ${provider.name} returned 200 but output failed schema validation. Trying next provider...`,
        );
        continue;
      }
      return result;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[Cloud LLM] ${provider.name} failed (${msg}). Trying next provider...`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
