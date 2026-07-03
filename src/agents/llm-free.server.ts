// Free-tier LLM gateway with provider cascade.
// Tries: Groq (fast, generous) → Google AI Studio (huge daily quota) → Cerebras (fast backup) → Ollama (local).
// Falls back to Ollama only if `allowLovableFallback: true` (explicit opt-in).
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
  /** Override provider order; default = ["groq","gemini","cerebras"]. Include "ollama" here to use the local model in-cascade. */
  preferred?: ProviderName[];
  /** If all free providers fail, fall back to Ollama. Default false. */
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

type ProviderName = "groq" | "gemini" | "cerebras" | "ollama";

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
  ollama: {
    name: "ollama",
    envKey: "OLLAMA_BASE_URL",
    url: "http://localhost:11434/v1/chat/completions",
    model: "qwen3:14b", // MoE 14B equiv, better for complex grant analysis
  },
};


async function callOpenAICompat(
  cfg: ProviderConfig,
  opts: FreeLlmOptions,
  modelOverride?: string,
): Promise<{ text: string; inputTokens?: number; outputTokens?: number; model: string }> {
  const apiKey = process.env[cfg.envKey];
  const model = modelOverride ?? cfg.model;

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxOutputTokens) body.max_tokens = opts.maxOutputTokens;
  if (opts.responseFormat === "json") body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status === 429) {
      const txt = (await res.text()).slice(0, 200);
      throw new Error(`${cfg.name}_rate_limited: ${txt}`);
    }
    if (res.status === 401 || res.status === 403) throw new Error(`${cfg.name}_unauthorized`);
    if (!res.ok) throw new Error(`${cfg.name}_${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return {
      text,
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
      model,
    };
  } finally {
    clearTimeout(t);
  }
}


export function freeProvidersAvailable(): ProviderName[] {
  return (Object.keys(PROVIDERS) as ProviderName[]).filter((p) => {
    if (p === "ollama") return true;
    return !!process.env[PROVIDERS[p].envKey];
  });
}

export async function callFreeLlm(opts: FreeLlmOptions): Promise<FreeLlmResult> {
  const runId = opts.runId ?? newRunId();
  // Ollama (localhost) is NOT in the default order — it is only reached via an
  // explicit `preferred` list or `allowLovableFallback` (see contract in
  // llm-cascade.e2e.test.ts: no surprise localhost calls).
  const explicitOrder = !!opts.preferred;
  const order = opts.preferred ?? (["groq", "gemini", "cerebras"] as ProviderName[]);
  const errors: string[] = [];

  for (const name of order) {
    const cfg = PROVIDERS[name];
    // With the default order, silently skip providers whose key is missing.
    // When the caller explicitly names providers, attempt them anyway (the
    // request goes keyless and the provider's own 401 surfaces as the error).
    if (!explicitOrder && name !== "ollama" && !process.env[cfg.envKey]) {
      errors.push(`${name}:no_key`);
      continue;
    }
    // Per-provider escalation:
    //   try primary model → on 429 wait + retry → on second 429 try
    //   each fallbackModel (different quota bucket on Groq/Gemini free tiers).
    const modelChain = [cfg.model, ...((cfg as { fallbackModels?: string[] }).fallbackModels ?? [])];
    let lastErr: string | undefined;
    outer: for (let mi = 0; mi < modelChain.length; mi++) {
      const model = modelChain[mi];
      for (let attempt = 1; attempt <= 2; attempt++) {
        const t0 = Date.now();
        let ok = false;
        let errMsg: string | undefined;
        let result: { text: string; inputTokens?: number; outputTokens?: number; model: string } | undefined;
        try {
          result = await callOpenAICompat(cfg, opts, model);
          ok = true;
        } catch (e) {
          errMsg = e instanceof Error ? e.message : String(e);
        } finally {
          logGenAI({
            "gen_ai.system": `free.${name}`,
            "gen_ai.request.model": model,
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
        lastErr = errMsg;
        const isRate = !!errMsg && /rate_limited/.test(errMsg);
        if (isRate && attempt === 1) {
          // 6s backoff — enough to clear most TPM windows on Groq/Gemini free
          await new Promise((r) => setTimeout(r, 6_000));
          continue;
        }
        // give up on this model; try next model in chain if any
        break;
      }
      // Don't waste fallback attempts on auth errors — the key is just bad.
      if (lastErr && /unauthorized/.test(lastErr)) break outer;
    }
    errors.push(`${name}:${lastErr ?? "unknown"}`);
  }



  // Optional Ollama fallback
  if (opts.allowLovableFallback) {
    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      model: PROVIDERS.ollama.model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      responseFormat: opts.responseFormat,
      agent: opts.agent,
      runId,
      forceLovable: true,
    });
    return {
      text: r.text,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      runId,
      provider: "ollama",
      model: PROVIDERS.ollama.model,
    };
  }

  throw new Error(`all_free_providers_failed: ${errors.join(" | ")}`);
}
