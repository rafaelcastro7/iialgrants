// Cloud LLM adapter — activates automatically when Ollama is unreachable.
// Uses Groq API (free tier, OpenAI-compatible) as a cloud fallback so the
// app works in production (Lovable / Supabase cloud) without code changes.
//
// Model mapping mirrors local agent assignments:
//   discoverer/enricher → llama-3.1-8b-instant  (fast, structured extraction)
//   evaluator/critic    → llama-3.3-70b-versatile (honest evaluation)
//   strategist/writer   → llama-3.3-70b-versatile (deep reasoning)

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
};

export type CloudLlmResult = {
    text: string;
    inputTokens?: number;
    outputTokens?: number;
    runId: string;
    provider: string;
    model: string;
};

// Cloud model map — free Groq tier equivalents of the local Ollama models
const CLOUD_MODEL_MAP: Record<AgentName, string> = {
    discoverer: "llama-3.1-8b-instant",
    enricher: "llama-3.1-8b-instant",
    evaluator: "llama-3.3-70b-versatile",
    strategist: "llama-3.3-70b-versatile",
    writer: "llama-3.3-70b-versatile",
    critic: "llama-3.3-70b-versatile",
};

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

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

async function callGroq(opts: CloudLlmOptions): Promise<CloudLlmResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error(
            "cloud_llm_unavailable: GROQ_API_KEY is not set. " +
            "Add it to your Lovable environment variables (Settings → Environment Variables)."
        );
    }

    const model = CLOUD_MODEL_MAP[opts.agent] ?? "llama-3.1-8b-instant";
    const runId = opts.runId ?? newRunId();
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
        const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`groq_error_${res.status}: ${errBody.slice(0, 300)}`);
        }

        const data = await res.json();
        const text: string = data?.choices?.[0]?.message?.content ?? "";
        const inputTokens: number | undefined = data?.usage?.prompt_tokens;
        const outputTokens: number | undefined = data?.usage?.completion_tokens;
        ok = true;

        return { text, inputTokens, outputTokens, runId, provider: "groq", model };
    } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
        throw e;
    } finally {
        logGenAI({
            "gen_ai.system": "groq",
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
 * Called by the environment-aware router when Ollama is not reachable.
 */
export async function callCloudLlm(opts: CloudLlmOptions): Promise<CloudLlmResult> {
    return callGroq(opts);
}
