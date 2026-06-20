// Lovable AI Gateway client (server-only). Used by all 6 agents.
// Reads LOVABLE_API_KEY at handler call time (per server-runtime rules).
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
};

export type LlmCallResult = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  runId: string;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing in environment");

  // Resolve per-agent config (model, temp, max tokens, json mode) from the
  // agent console. The console-stored value wins over caller-passed values,
  // so admin edits in /admin/agents take effect within ~30s (cache TTL).
  let resolvedModel = opts.model;
  let resolvedTemp = opts.temperature ?? 0.2;
  let resolvedMax = opts.maxOutputTokens;
  let resolvedJson = opts.responseFormat === "json";
  let fallbackModel: string | null = null;
  let maxRetries = 2;
  try {
    const { resolveAgentConfig } = await import("@/lib/agent-config.server");
    const cfg = await resolveAgentConfig(opts.agent);
    resolvedModel = cfg.model;
    resolvedTemp = cfg.temperature;
    resolvedMax = cfg.max_output_tokens;
    resolvedJson = cfg.json_mode || resolvedJson;
    fallbackModel = cfg.fallback_model;
    maxRetries = cfg.max_retries;
  } catch {
    // If config table unreachable, fall back to caller values.
  }

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
    return fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };


    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) throw new Error("rate_limited: AI gateway 429");
    if (res.status === 402) throw new Error("payment_required: add credits to Lovable AI workspace");
    if (!res.ok) throw new Error(`gateway_error_${res.status}: ${await res.text()}`);

    const data = await res.json();
    text = data?.choices?.[0]?.message?.content ?? "";
    inputTokens = data?.usage?.prompt_tokens;
    outputTokens = data?.usage?.completion_tokens;
    ok = true;
    return { text, inputTokens, outputTokens, runId };
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    logGenAI({
      "gen_ai.system": "lovable.ai",
      "gen_ai.request.model": opts.model,
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
