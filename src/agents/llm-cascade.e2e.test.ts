// E2E: free-provider cascade fallback behavior.
//
// Guarantees the contract the user demanded: "no Lovable credits when free
// providers are available". We simulate failures on groq + gemini and assert
// that (a) cerebras serves the request, (b) the Lovable AI Gateway URL is
// never touched, and (c) Lovable is only invoked when the caller explicitly
// opts in (forceLovable / allowLovableFallback) AND every free provider has
// failed.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
    JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const errBody = (status: number, msg = "boom") =>
  new Response(msg, { status });

describe("free LLM cascade fallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GOOGLE_AI_STUDIO_KEY = "test-gemini";
    process.env.CEREBRAS_API_KEY = "test-cerebras";
    process.env.LOVABLE_API_KEY = "test-lovable";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("falls through groq(429) → gemini(500) → cerebras(ok) without touching Lovable", async () => {
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
    expect(calls).toEqual([GROQ_URL, GEMINI_URL, CEREBRAS_URL]);
    expect(calls).not.toContain(LOVABLE_URL);
  });

  it("callLlm routes through free cascade by default and never hits Lovable when a free provider succeeds", async () => {
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
    expect(calls).not.toContain(LOVABLE_URL);
  });

  it("only hits Lovable when caller sets forceLovable:true (explicit opt-in)", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === LOVABLE_URL) return okBody("from-lovable");
      return errBody(500, "should not be called");
    });

    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "evaluator",
      messages: [{ role: "user", content: "hi" }],
      forceLovable: true,
    });

    expect(r.text).toBe("from-lovable");
    expect(calls).toEqual(expect.arrayContaining([LOVABLE_URL]));
    expect(calls).not.toContain(GROQ_URL);
    expect(calls).not.toContain(GEMINI_URL);
    expect(calls).not.toContain(CEREBRAS_URL);
  });

  it("when every free provider fails, refuses Lovable unless allowLovableFallback is set", async () => {
    mockFetch((url) => {
      if (url === GROQ_URL || url === GEMINI_URL || url === CEREBRAS_URL) return errBody(500);
      throw new Error(`unexpected fetch: ${url}`);
    });
    const { callFreeLlm } = await import("@/agents/llm-free.server");
    await expect(
      callFreeLlm({ agent: "enricher", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/all_free_providers_failed/);
  });

  it("skips providers with missing keys instead of erroring", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_AI_STUDIO_KEY;
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === CEREBRAS_URL) return okBody("cerebras-only");
      throw new Error(`unexpected fetch: ${url}`);
    });
    const { callFreeLlm } = await import("@/agents/llm-free.server");
    const r = await callFreeLlm({ agent: "enricher", messages: [{ role: "user", content: "hi" }] });
    expect(r.provider).toBe("cerebras");
    expect(calls).toEqual([CEREBRAS_URL]);
  });
});
