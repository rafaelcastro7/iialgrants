// Local-only LLM client — all cloud dependencies removed.
// Routes each agent to its optimal local model via model-router.
import { logGenAI, newRunId } from "@/lib/otel";
import { resolveModel, resolveFallback } from "@/agents/model-router.server";
import { timeoutFor, usesStreamingClient } from "@/agents/llm-timeouts.server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmCallOptions = {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
  runId?: string;
  responseFormat?: "json";
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
// timeoutFor/usesStreamingClient live in llm-timeouts.server.ts, SHARED with
// llm-free.server.ts's callFreeLlm (enricher's gap-fill cascade) — this exact
// bug happened once already when the two clients' timeout logic diverged (see
// that file's header comment).

function toLocalModel(model: string | null | undefined): string {
  if (!model) return DEFAULT_LOCAL_MODEL;
  const looksCloud =
    model.includes("/") || /^(gpt|o1|o3|claude|gemini|command|mistral-large)/i.test(model);
  return looksCloud ? DEFAULT_LOCAL_MODEL : model;
}

async function doOllamaCall(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number | undefined,
  jsonMode: boolean,
  stream: boolean,
  signal: AbortSignal,
) {
  // Native /api/chat, NOT the OpenAI-compat /v1 endpoint: the compat layer
  // silently IGNORES the `options` field, so the old num_ctx=8192 was never
  // applied (found via `ollama ps` showing ctx 4096 during live runs). We
  // codify 4096 — the context every successful run actually used, and what
  // fits an 8GB card without CPU offload. num_predict enforces the caller's
  // output bound server-side.
  const options: Record<string, unknown> = { num_ctx: 4096, temperature };
  if (maxTokens) options.num_predict = maxTokens;
  const body: Record<string, unknown> = { model, messages, stream, options };
  if (jsonMode) body.format = "json";
  return fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function readOllamaResponse(res: Response, stream: boolean) {
  if (!stream) return res.json();
  if (!res.body) throw new Error("ollama_stream_missing_body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let promptEvalCount: number | undefined;
  let evalCount: number | undefined;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const data = JSON.parse(trimmed);
    content += data?.message?.content ?? "";
    if (data?.done) {
      promptEvalCount = data?.prompt_eval_count;
      evalCount = data?.eval_count;
    }
  };

  // A malformed/truncated ndjson line (JSON.parse inside consumeLine) must
  // still release the reader lock on its way out — without this, a parse
  // error left the stream reader locked instead of failing cleanly.
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }

    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }

  return {
    message: { content },
    prompt_eval_count: promptEvalCount,
    eval_count: evalCount,
  };
}

async function isModelLoaded(model: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return true; // can't confirm — assume loaded, see catch below
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    return models.some((m: Record<string, unknown>) => m.name === model || m.model === model);
  } catch {
    // A transient /api/ps hiccup is most likely when Ollama is already busy
    // serving another slow agent's call — exactly when a serial 1-token
    // prewarm request would queue in front of the real call and add latency
    // for nothing. Fail OPEN (assume loaded, skip prewarm): a genuinely cold
    // model still succeeds because the main call's timeout floor already
    // budgets for cold-start load time (see llm-timeouts.server.ts).
    return true;
  }
}

async function prewarmModel(model: string, signal: AbortSignal): Promise<void> {
  if (await isModelLoaded(model)) return;
  const res = await doOllamaCall(
    model,
    [{ role: "user", content: "OK" }],
    0,
    1,
    false,
    false,
    signal,
  );
  if (!res.ok) throw new Error(`ollama_prewarm_${res.status}: ${await res.text()}`);
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
  const agentModel = opts.model ? toLocalModel(opts.model) : resolveModel(opts.agent);
  let fallback = resolveFallback(opts.agent);

  let usedModel = agentModel;
  let resolvedTemp = opts.temperature ?? 0.2;
  let resolvedMax = opts.maxOutputTokens;
  let resolvedJson = opts.responseFormat === "json";

  let configuredTimeoutMs: number | undefined;
  try {
    const { resolveAgentConfig } = await import("@/lib/agent-config.server");
    const cfg = await resolveAgentConfig(opts.agent);
    if (!opts.model) usedModel = cfg.model ? toLocalModel(cfg.model) : agentModel;
    fallback = cfg.fallback_model ? toLocalModel(cfg.fallback_model) : fallback;
    resolvedTemp = cfg.temperature;
    resolvedMax = opts.maxOutputTokens ?? cfg.max_output_tokens;
    resolvedJson = cfg.json_mode || resolvedJson;
    configuredTimeoutMs = cfg.timeout_ms;
  } catch {
    // DB config unreachable — use resolved values above
  }

  // Normalize cloud model IDs that might come from DB
  usedModel = toLocalModel(usedModel);
  const fallbackModel = fallback ? toLocalModel(fallback) : null;
  const streamResponse = usesStreamingClient(opts.agent);
  const callTimeoutMs = timeoutFor(opts.agent, configuredTimeoutMs);

  // A discarded streamed Response (retry/fallback below) leaves its body
  // unread — undici won't release the underlying socket back to the
  // connection pool until the body is consumed or cancelled, so every
  // retried/superseded response must be explicitly cancelled here.
  const discard = (response: Response) => {
    if (streamResponse) response.body?.cancel().catch(() => {});
  };

  try {
    if (usesStreamingClient(opts.agent)) {
      // True worst case for a cold model on a slow agent is prewarm (up to
      // 180s) PLUS the main call (up to callTimeoutMs, e.g. 600s for writer)
      // — up to 780s, not just callTimeoutMs alone. Any watchdog/reverse-proxy
      // timeout wrapping draftSection or similar must account for both.
      try {
        await prewarmModel(usedModel, AbortSignal.timeout(180_000));
      } catch (prewarmErr) {
        if (!fallbackModel || fallbackModel === usedModel) throw prewarmErr;
        const failedModel = usedModel;
        usedModel = fallbackModel;
        logGenAI({
          "gen_ai.system": "ollama",
          "gen_ai.request.model": failedModel,
          "gen_ai.operation.name": "chat",
          latency_ms: Date.now() - t0,
          agent: opts.agent,
          run_id: runId,
          ok: false,
          error: prewarmErr instanceof Error ? prewarmErr.message : String(prewarmErr),
        });
        await prewarmModel(usedModel, AbortSignal.timeout(180_000));
      }
    }

    let res = await doOllamaCall(
      usedModel,
      opts.messages,
      resolvedTemp,
      resolvedMax,
      resolvedJson,
      streamResponse,
      AbortSignal.timeout(callTimeoutMs),
    );

    let attempt = 0;
    const maxRetries = 2;
    while (!res.ok && (res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      attempt++;
      discard(res);
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
      res = await doOllamaCall(
        usedModel,
        opts.messages,
        resolvedTemp,
        resolvedMax,
        resolvedJson,
        streamResponse,
        AbortSignal.timeout(callTimeoutMs),
      );
    }

    // Fallback to secondary model if primary fails
    if (!res.ok && fallbackModel && fallbackModel !== usedModel) {
      discard(res);
      usedModel = fallbackModel;
      res = await doOllamaCall(
        fallbackModel,
        opts.messages,
        resolvedTemp,
        resolvedMax,
        resolvedJson,
        streamResponse,
        AbortSignal.timeout(callTimeoutMs),
      );
    }

    if (!res.ok) throw new Error(`ollama_error_${res.status}: ${await res.text()}`);

    const data = await readOllamaResponse(res, streamResponse);
    text = data?.message?.content ?? "";
    inputTokens = data?.prompt_eval_count;
    outputTokens = data?.eval_count;
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
