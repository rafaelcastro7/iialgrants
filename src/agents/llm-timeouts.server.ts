// Shared timeout policy for BOTH local-LLM clients (llm.server.ts's callLlm
// and llm-free.server.ts's callFreeLlm). Extracted after this exact bug
// happened TWICE: llm.server.ts got a per-agent timeout floor first; the
// sibling llm-free.server.ts (used by enricher's gap-fill cascade) kept a
// hardcoded 180_000ms and was never updated. A live re-enrichment run on
// 2026-07-10 (15 previously-stuck grants, after raising deep-crawl's page
// budget 3→6 which grows the enricher's prompt) showed EVERY enricher LLM
// call aborting at exactly 180s, 2-4 attempts per grant (~12 min/grant before
// giving up) — the same class of bug the writer/evaluator/strategist/critic
// fix (7f417cb) was supposed to close everywhere. One shared function now,
// so a future timeout change can't silently apply to only one client.
const LOCAL_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 0) || 180_000;

// Generation-heavy agents exceed the env baseline on this hardware. Live E2E
// measurements on dolphin3 / GTX 1070: writer warm ~220s, cold-start streamed
// ~410s; evaluator/enricher batch runs have hit the 180s baseline repeatedly
// under load, including plain (non-streamed) enricher gap-fill calls once
// deep-crawl feeds them a larger multi-page prompt.
const SLOW_AGENT_TIMEOUT_FLOORS_MS: Record<string, number> = {
  writer: 600_000,
  evaluator: 300_000,
  strategist: 300_000,
  critic: 300_000,
  enricher: 300_000,
};

// configuredMs (agent_configs.timeout_ms, admin-editable) can only RAISE the
// floor, never lower it — an admin setting a low value must not reintroduce
// the mid-generation abort bug this module exists to prevent.
export function timeoutFor(agent: string, configuredMs?: number): number {
  return Math.max(LOCAL_TIMEOUT_MS, SLOW_AGENT_TIMEOUT_FLOORS_MS[agent] ?? 0, configuredMs ?? 0);
}

// Which agents get llm.server.ts's streaming + prewarm treatment. Narrower
// than the timeout-floor set above on purpose: enricher gets the same
// generous TIMEOUT via callFreeLlm (a separate, non-streaming client), but
// doesn't go through llm.server.ts's streaming call path, so it's excluded
// here to avoid changing behavior nothing has exercised/tested.
const STREAMING_AGENTS = new Set(["writer", "evaluator", "strategist", "critic"]);
export function usesStreamingClient(agent: string): boolean {
  return STREAMING_AGENTS.has(agent);
}
