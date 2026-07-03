// Ollama LLM client (server-only). Used by all 6 agents.
import { logGenAI, newRunId } from "@/lib/otel";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmCallOptions = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
  runId?: string;
  responseFormat?: "json";
  /**
   * When true, skip the free-provider cascade and use Ollama directly.
   */
  forceLovable?: boolean;
};

export type LlmCallResult = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  runId: string;
  model?: string;
  provider?: string;
};

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const DEFAULT_LOCAL_MODEL = process.env.OLLAMA_MODEL || "qwen3:14b";
const LOCAL_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 0) || null;

// Cloud model ids ("google/gemini-2.5-pro", "gpt-4o", "claude-…") are
// meaningless to Ollama and 404 there. When executing against the LOCAL
// Ollama endpoint, map any non-local model id to the configured local default
// so the local-first fallback actually runs instead of crashing.
function toLocalModel(model: string | null | undefined): string {
  if (!model) return DEFAULT_LOCAL_MODEL;
  const looksCloud =
    model.includes("/") || /^(gpt|o1|o3|claude|gemini|command|mistral-large)/i.test(model);
  return looksCloud ? DEFAULT_LOCAL_MODEL : model;
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  if (!opts.forceLovable) {
    try {
      const { callFreeLlm, freeProvidersAvailable } = await import("@/agents/llm-free.server");
      if (freeProvidersAvailable().length > 0) {
        const r = await callFreeLlm({
          agent: opts.agent,
          messages: opts.messages,
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          responseFormat: opts.responseFormat,
          runId: opts.runId,
          allowLovableFallback: true,
        });
        return {
          text: r.text,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          runId: r.runId,
          model: r.model,
          provider: r.provider,
        };
      }
    } catch (e) {
      console.warn(
        "[callLlm] free cascade failed, falling back to Ollama:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  let resolvedModel = opts.model;
  let resolvedTemp = opts.temperature ?? 0.2;
  let resolvedMax = opts.maxOutputTokens;
  let resolvedJson = opts.responseFormat === "json";
  let fallbackModel: string | null = null;
  let maxRetries = 2;
  let timeoutMs = 60_000;
  try {
    const { resolveAgentConfig } = await import("@/lib/agent-config.server");
    const cfg = await resolveAgentConfig(opts.agent);
    resolvedModel = cfg.model;
    resolvedTemp = cfg.temperature;
    resolvedMax = opts.maxOutputTokens ?? cfg.max_output_tokens;
    resolvedJson = cfg.json_mode || resolvedJson;
    fallbackModel = cfg.fallback_model;
    maxRetries = cfg.max_retries;
    timeoutMs = cfg.timeout_ms;
  } catch {
    // If config table unreachable, fall back to caller values.
  }

  // This code path talks to Ollama — coerce any cloud model id to a local one.
  resolvedModel = toLocalModel(resolvedModel);
  fallbackModel = fallbackModel ? toLocalModel(fallbackModel) : null;

  const runId = opts.runId ?? newRunId();
  const t0 = Date.now();
  let ok = false;
  let errMsg: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let text = "";
  let usedModel = resolvedModel;

  const doCall = async (model: string) => {
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: resolvedTemp,
    };
    if (resolvedMax) body.max_tokens = resolvedMax;
    if (resolvedJson) body.response_format = { type: "json_object" };
    return fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS ?? timeoutMs),
    });
  };

  try {
    let res = await doCall(resolvedModel);
    let attempt = 0;
    while (!res.ok && (res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      attempt++;
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
      res = await doCall(resolvedModel);
    }
    if (!res.ok && fallbackModel && fallbackModel !== resolvedModel) {
      usedModel = fallbackModel;
      res = await doCall(fallbackModel);
    }

    if (res.status === 429) throw new Error("rate_limited: Ollama 429");
    if (!res.ok) throw new Error(`ollama_error_${res.status}: ${await res.text()}`);

    const data = await res.json();
    text = data?.choices?.[0]?.message?.content ?? "";
    inputTokens = data?.usage?.prompt_tokens;
    outputTokens = data?.usage?.completion_tokens;
    ok = true;
    return { text, inputTokens, outputTokens, runId, model: usedModel, provider: "ollama" };
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    logGenAI({
      "gen_ai.system": "ollama",
      "gen_ai.request.model": usedModel,
      "gen_ai.operation.name": "chat",
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
      latency_ms: Date.now() - t0,
      agent: opts.agent,
      run_id: runId,
      ok,
      error: errMsg,
    });
  }
}
