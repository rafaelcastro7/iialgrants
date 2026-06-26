// Free-tier LLM gateway with provider cascade.
// Tries: Groq (fast, generous) → Google AI Studio (huge daily quota) → Cerebras (fast backup).
// Falls back to Lovable AI Gateway only if `allowLovableFallback: true` (explicit opt-in).
//
// All providers expose an OpenAI-compatible chat-completions endpoint with
// JSON mode. API keys are optional secrets — if a provider's key is missing,
// it's skipped, not errored.

import { logGenAI, newRunId } from "@/lib/otel";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Agent = "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";

export type FreeLlmOptions = {
  agent: Agent;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "json";
  runId?: string;
  /** Override provider order; default = ["groq","gemini","cerebras"]. */
  preferred?: ProviderName[];
  /** If all free providers fail, fall back to Lovable AI Gateway. Default false. */
  allowLovableFallback?: boolean;
};

export type FreeLlmResult = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  runId: string;
  provider: ProviderName | "lovable";
  model: string;
};

type ProviderName = "groq" | "gemini" | "cerebras";

type ProviderConfig = {
  name: ProviderName;
  envKey: string;
  url: string;
  model: string;
};

const PROVIDERS: Record<ProviderName, ProviderConfig & { fallbackModels?: string[] }> = {
  groq: {
    name: "groq",
    envKey: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    // If 70b hits TPM ceiling, retry with the cheaper/lighter 8b-instant
    // (separate quota bucket on Groq free tier).
    fallbackModels: ["llama-3.1-8b-instant"],
  },
  gemini: {
    name: "gemini",
    envKey: "GOOGLE_AI_STUDIO_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.0-flash", "gemini-2.5-flash-lite"],
  },
  cerebras: {
    name: "cerebras",
    envKey: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama-3.3-70b",
  },
};


async function callOpenAICompat(
  cfg: ProviderConfig,
  opts: FreeLlmOptions,
): Promise<{ text: string; inputTokens?: number; outputTokens?: number; model: string }> {
  const apiKey = process.env[cfg.envKey];
  if (!apiKey) throw new Error(`missing_${cfg.envKey}`);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxOutputTokens) body.max_tokens = opts.maxOutputTokens;
  if (opts.responseFormat === "json") body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status === 429) throw new Error(`${cfg.name}_rate_limited`);
    if (res.status === 401 || res.status === 403) throw new Error(`${cfg.name}_unauthorized`);
    if (!res.ok) throw new Error(`${cfg.name}_${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return {
      text,
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
      model: cfg.model,
    };
  } finally {
    clearTimeout(t);
  }
}

export function freeProvidersAvailable(): ProviderName[] {
  return (Object.keys(PROVIDERS) as ProviderName[]).filter((p) => !!process.env[PROVIDERS[p].envKey]);
}

export async function callFreeLlm(opts: FreeLlmOptions): Promise<FreeLlmResult> {
  const runId = opts.runId ?? newRunId();
  const order = opts.preferred ?? (["groq", "gemini", "cerebras"] as ProviderName[]);
  const errors: string[] = [];

  for (const name of order) {
    const cfg = PROVIDERS[name];
    if (!process.env[cfg.envKey]) {
      errors.push(`${name}:no_key`);
      continue;
    }
    // Up to 2 attempts per provider: on rate_limit we wait a short backoff and
    // retry once before moving to the next provider. This soaks up the bursty
    // 30-RPM ceiling of Groq's free tier without immediately failing over.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      let ok = false;
      let errMsg: string | undefined;
      let result: { text: string; inputTokens?: number; outputTokens?: number; model: string } | undefined;
      try {
        result = await callOpenAICompat(cfg, opts);
        ok = true;
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
      } finally {
        logGenAI({
          "gen_ai.system": `free.${name}`,
          "gen_ai.request.model": cfg.model,
          "gen_ai.operation.name": "chat",
          "gen_ai.usage.input_tokens": result?.inputTokens,
          "gen_ai.usage.output_tokens": result?.outputTokens,
          latency_ms: Date.now() - t0,
          agent: opts.agent,
          run_id: runId,
          ok,
          error: errMsg,
        });
      }
      if (ok && result) {
        return {
          text: result.text,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          runId,
          provider: name,
          model: result.model,
        };
      }
      const isRate = !!errMsg && /rate_limited/.test(errMsg);
      if (isRate && attempt === 1) {
        await new Promise((r) => setTimeout(r, 2_500));
        continue;
      }
      errors.push(`${name}:${errMsg ?? "unknown"}`);
      break;
    }
  }


  // Optional Lovable fallback
  if (opts.allowLovableFallback) {
    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      model: "google/gemini-2.5-flash",
      messages: opts.messages,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      responseFormat: opts.responseFormat,
      agent: opts.agent,
      runId,
    });
    return {
      text: r.text,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      runId,
      provider: "lovable",
      model: "google/gemini-2.5-flash",
    };
  }

  throw new Error(`all_free_providers_failed: ${errors.join(" | ")}`);
}
