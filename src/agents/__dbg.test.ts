import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
describe("dbg", () => {
  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.GROQ_API_KEY;
    vi.resetModules();
  });
  it("dump", async () => {
    const calls: string[] = [];
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.endsWith("/api/ps")) return new Response(JSON.stringify({ models: [] }));
      if (url.endsWith("/api/chat")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
        if (body.model === "dolphin3:latest") return new Response(JSON.stringify({ error: "nf" }), { status: 404 });
        return new Response(JSON.stringify({ message: { content: "x" }, usage:{prompt_tokens:1,completion_tokens:1} }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    (globalThis as any).fetch = spy;
    const { callLlm } = await import("@/agents/llm.server");
    await callLlm({ agent: "evaluator", messages: [{ role: "user", content: "hi" }] }).catch(e=>console.log("ERR",e.message));
    console.log("CALLS:", JSON.stringify(calls, null, 2));
    expect(true).toBe(true);
  }, 15000);
});
