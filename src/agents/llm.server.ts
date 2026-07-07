// Local-only LLM client — all cloud dependencies removed.
// Routes each agent to its optimal local model via model-router.
import { logGenAI, newRunId } from "@/lib/otel";
import { resolveModel, resolveFallback } from "@/agents/model-router.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmCallOptions = {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
  runId?: string;
  responseFormat?: "json";
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
const DEFAULT_LOCAL_MODEL = process.env.OLLAMA_MODEL || "phi4-mini:latest";
const LOCAL_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 0) || 180_000;

function toLocalModel(model: string | null | undefined): string {
  if (!model) return DEFAULT_LOCAL_MODEL;
  const looksCloud = model.includes("/") || /^(gpt|o1|o3|claude|gemini|command|mistral-large)/i.test(model);
  return looksCloud ? DEFAULT_LOCAL_MODEL : model;
}

async function doOllamaCall(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number | undefined,
  jsonMode: boolean,
  signal: AbortSignal,
) {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    options: { num_ctx: 8192 },
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (jsonMode) body.response_format = { type: "json_object" };
  return fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const runId = opts.runId ?? newRunId();
  const t0 = Date.now();
  let ok = false;
  let errMsg: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let text = "";

  // Resolve model: explicit > agent-optimized > env default
  const agentModel = opts.model
    ? toLocalModel(opts.model)
    : resolveModel(opts.agent);
  const fallback = resolveFallback(opts.agent);

  let usedModel = agentModel;
  let resolvedTemp = opts.temperature ?? 0.2;
  let resolvedMax = opts.maxOutputTokens;
  let resolvedJson = opts.responseFormat === "json";

  try {
    const { resolveAgentConfig } = await import("@/lib/agent-config.server");
    const cfg = await resolveAgentConfig(opts.agent);
    if (!opts.model) usedModel = cfg.model ? toLocalModel(cfg.model) : agentModel;
    resolvedTemp = cfg.temperature;
    resolvedMax = opts.maxOutputTokens ?? cfg.max_output_tokens;
    resolvedJson = cfg.json_mode || resolvedJson;
  } catch {
    // DB config unreachable — use resolved values above
  }

  // Normalize cloud model IDs that might come from DB
  usedModel = toLocalModel(usedModel);
  const fallbackModel = fallback ? toLocalModel(fallback) : null;

  try {
    let res = await doOllamaCall(usedModel, opts.messages, resolvedTemp, resolvedMax, resolvedJson,
      AbortSignal.timeout(LOCAL_TIMEOUT_MS));

    let attempt = 0;
    const maxRetries = 2;
    while (!res.ok && (res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      attempt++;
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
      res = await doOllamaCall(usedModel, opts.messages, resolvedTemp, resolvedMax, resolvedJson,
        AbortSignal.timeout(LOCAL_TIMEOUT_MS));
    }

    // Fallback to secondary model if primary fails
    if (!res.ok && fallbackModel && fallbackModel !== usedModel) {
      usedModel = fallbackModel;
      res = await doOllamaCall(fallbackModel, opts.messages, resolvedTemp, resolvedMax, resolvedJson,
        AbortSignal.timeout(LOCAL_TIMEOUT_MS));
    }

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
