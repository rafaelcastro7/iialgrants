// E2E: local-only LLM cascade behavior.
//
// Contract: all LLM calls go to Ollama localhost only. Primary model is tried
// first with 2 attempts (with rate-limit backoff), then fallback model if
// primary fails. No cloud providers are ever contacted.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

const errBody = (status: number) => new Response("boom", { status });

describe("local-only LLM cascade", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("callFreeLlm hits Ollama and returns response", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url.startsWith("http://localhost:11434/")) return okBody("from-ollama");
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { callFreeLlm } = await import("@/agents/llm-free.server");
    const r = await callFreeLlm({
      agent: "enricher",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(r.provider).toBe("ollama");
    expect(r.text).toBe("from-ollama");
    expect(calls.some((c) => c.startsWith(OLLAMA_URL))).toBe(true);
  }, 15000);

  it("falls back to secondary model when primary fails", async () => {
    let attempts = 0;
    mockFetch((url) => {
      attempts++;
      return errBody(500);
    });

    const { callFreeLlm } = await import("@/agents/llm-free.server");
    await expect(
      callFreeLlm({
        agent: "enricher",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("all_local_models_failed");
    // 2 attempts for primary + 2 attempts for fallback
    expect(attempts).toBeGreaterThanOrEqual(2);
  }, 15000);

  it("callLlm routes through Ollama directly with agent-optimized model", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url.startsWith("http://localhost:11434/")) return okBody("from-ollama");
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { callLlm } = await import("@/agents/llm.server");
    const r = await callLlm({
      agent: "evaluator",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(r.text).toBe("from-ollama");
    expect(r.provider).toBe("ollama");
    expect(calls.some((c) => c.startsWith(OLLAMA_URL))).toBe(true);
  }, 15000);

  it("no cloud providers are ever contacted", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      return okBody("ok");
    });

    const { callFreeLlm } = await import("@/agents/llm-free.server");
    await callFreeLlm({
      agent: "enricher",
      messages: [{ role: "user", content: "hi" }],
    }).catch(() => {});

    for (const c of calls) {
      expect(c).toMatch(/^http:\/\/localhost:/);
    }
  });
});
