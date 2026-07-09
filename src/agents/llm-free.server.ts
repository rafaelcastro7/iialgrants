// Local-first LLM gateway — cloud providers removed.
// Cascades: primary model → fallback model (both Ollama local).
// Re-enable cloud: add provider configs + API keys back.
//
// All providers expose an OpenAI-compatible chat-completions endpoint.

import { logGenAI, newRunId } from "@/lib/otel";
import { resolveModel, resolveFallback } from "@/agents/model-router.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Agent = "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";

export type FreeLlmOptions = {
  agent: Agent;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "json";
  runId?: string;
  preferred?: string[];
};

export type FreeLlmResult = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  runId: string;
  provider: string;
  model: string;
};

type ProviderConfig = {
  name: string;
  url: string;
  model: string;
};

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Native /api/chat, NOT the OpenAI-compat /v1 endpoint — the compat layer
// silently ignores `options` (num_ctx/num_predict were never applied). Same
// fix as llm.server.ts; 4096 ctx is what fits an 8GB card without offload.
async function callOllamaNative(
  url: string,
  model: string,
  opts: FreeLlmOptions,
): Promise<{ text: string; inputTokens?: number; outputTokens?: number; model: string }> {
  const options: Record<string, unknown> = {
    num_ctx: 4096,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxOutputTokens) options.num_predict = opts.maxOutputTokens;
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    stream: false,
    options,
  };
  if (opts.responseFormat === "json") body.format = "json";

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`local_${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data?.message?.content ?? "";
    return {
      text,
      inputTokens: data?.prompt_eval_count,
      outputTokens: data?.eval_count,
      model,
    };
  } finally {
    clearTimeout(t);
  }
}

export function freeProvidersAvailable(): string[] {
  return ["ollama"];
}

export async function callFreeLlm(opts: FreeLlmOptions): Promise<FreeLlmResult> {
  const runId = opts.runId ?? newRunId();

  const primaryModel = resolveModel(opts.agent);
  const fallbackModel = resolveFallback(opts.agent);
  const modelChain = [primaryModel, ...(fallbackModel ? [fallbackModel] : [])];

  const errors: string[] = [];

  for (const model of modelChain) {
    let lastErrMsg: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      let ok = false;
      let errMsg: string | undefined;
      let result:
        | { text: string; inputTokens?: number; outputTokens?: number; model: string }
        | undefined;
      try {
        result = await callOllamaNative(`${OLLAMA_URL}/api/chat`, model, opts);
        ok = true;
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
      } finally {
        logGenAI({
          "gen_ai.system": "ollama",
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
          provider: "ollama",
          model: result.model,
        };
      }
      if (errMsg && /rate_limited/.test(errMsg)) {
        lastErrMsg = errMsg;
        await new Promise((r) => setTimeout(r, 1_000));
        continue;
      }
      if (errMsg) lastErrMsg = errMsg;
    }
    errors.push(`${model}:${lastErrMsg ?? "failed"}`);
  }

  throw new Error(`all_local_models_failed: ${errors.join(" | ")}`);
}
