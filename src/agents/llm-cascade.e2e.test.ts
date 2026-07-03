// E2E: free-provider cascade fallback behavior (local-first policy).
//
// Contract: free cloud providers (groq → gemini → cerebras) are tried first;
// local Ollama is (a) never touched while a free provider succeeds, (b) used
// automatically as the last-resort fallback when EVERY free provider fails
// (zero cloud cost — it's localhost), and (c) used exclusively when the caller
// opts in with forceLovable.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return impl(url);
  });
  (globalThis as unknown as { fetch: unknown }).fetch = spy;
  return spy;
}

const okBody = (text: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const errBody = (status: number, msg = "boom") => new Response(msg, { status });

describe("free LLM cascade fallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GOOGLE_AI_STUDIO_KEY = "test-gemini";
    process.env.CEREBRAS_API_KEY = "test-cerebras";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("falls through groq(429) → gemini(500) → cerebras(ok) without touching Ollama", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === GROQ_URL) return errBody(429, "rate limited");
      if (url === GEMINI_URL) return errBody(500, "server error");
      if (url === CEREBRAS_URL) return okBody("from-cerebras");
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { callFreeLlm } = await import("@/agents/llm-free.server");
    const r = await callFreeLlm({
      agent: "enricher",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(r.provider).toBe("cerebras");
    expect(r.text).toBe("from-cerebras");
    expect(new Set(calls)).toEqual(new Set([GROQ_URL, GEMINI_URL, CEREBRAS_URL]));
    expect(calls).not.toContain(OLLAMA_URL);
  }, 15000);

  it("callLlm routes through free cascade by default and never hits Ollama when a free provider succeeds", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === GROQ_URL) return errBody(429);
      if (url === GEMINI_URL) return errBody(503);
      if (url === CEREBRAS_URL) return okBody("ok-from-cerebras");
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "evaluator",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(r.text).toBe("ok-from-cerebras");
    expect(calls).not.toContain(OLLAMA_URL);
  }, 15000);

  it("only hits Ollama when caller sets forceLovable:true (explicit opt-in)", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === OLLAMA_URL) return okBody("from-ollama");
      return errBody(500, "should not be called");
    });

    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "evaluator",
      messages: [{ role: "user", content: "hi" }],
      forceLovable: true,
    });

    expect(r.text).toBe("from-ollama");
    expect(calls).toEqual(expect.arrayContaining([OLLAMA_URL]));
    expect(calls).not.toContain(GROQ_URL);
    expect(calls).not.toContain(GEMINI_URL);
    expect(calls).not.toContain(CEREBRAS_URL);
  });

  it("when every free provider fails, falls back to local Ollama automatically", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === GROQ_URL || url === GEMINI_URL || url === CEREBRAS_URL) return errBody(500);
      if (url === OLLAMA_URL) return okBody("from-ollama-fallback");
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "enricher",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.text).toBe("from-ollama-fallback");
    // All three free providers were attempted before Ollama.
    expect(calls).toEqual(expect.arrayContaining([GROQ_URL, GEMINI_URL, CEREBRAS_URL, OLLAMA_URL]));
  });

  it("skips providers with missing keys instead of erroring", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_AI_STUDIO_KEY;
    delete process.env.CEREBRAS_API_KEY;
    vi.resetModules();

    mockFetch((url) => {
      if (url === CEREBRAS_URL) return okBody("ok");
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { callFreeLlm } = await import("@/agents/llm-free.server");
    const r = await callFreeLlm({
      agent: "enricher",
      messages: [{ role: "user", content: "hi" }],
      preferred: ["cerebras"],
    });

    expect(r.text).toBe("ok");
  });
});
