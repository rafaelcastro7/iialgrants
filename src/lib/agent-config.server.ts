// Resolves per-agent runtime config (model, prompt, generation params).
// Called by callLlm and by the agent console. 30s in-memory cache to avoid
// hammering the DB on every LLM call.
import { PROMPTS } from "@/agents/schemas";

export type AgentName = "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";

export type AgentConfig = {
  agent: AgentName;
  model: string;
  fallback_model: string | null;
  temperature: number;
  top_p: number;
  max_output_tokens: number;
  json_mode: boolean;
  system_prompt: string | null;
  prompt_version: string;
  timeout_ms: number;
  max_retries: number;
  concurrency: number;
};

type CacheEntry = { value: AgentConfig; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

export function invalidateAgentConfigCache(agent?: string) {
  if (agent) cache.delete(agent);
  else cache.clear();
}

export async function resolveAgentConfig(agent: AgentName): Promise<AgentConfig> {
  const hit = cache.get(agent);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("agent_configs" as never)
    .select("*")
    .eq("agent", agent)
    .maybeSingle();
  if (error) throw new Error(`agent_config_load: ${error.message}`);

  const row = (data ?? {}) as Partial<AgentConfig>;
  const builtin = PROMPTS[agent]?.system ?? "";
  const cfg: AgentConfig = {
    agent,
    model: row.model ?? "google/gemini-2.5-flash",
    fallback_model: row.fallback_model ?? null,
    temperature: row.temperature ?? 0.2,
    top_p: row.top_p ?? 1.0,
    max_output_tokens: row.max_output_tokens ?? 2048,
    json_mode: row.json_mode ?? true,
    system_prompt: row.system_prompt && row.system_prompt.trim().length > 0 ? row.system_prompt : builtin,
    prompt_version: row.prompt_version ?? (PROMPTS[agent]?.version ?? "1.0.0"),
    timeout_ms: row.timeout_ms ?? 60000,
    max_retries: row.max_retries ?? 2,
    concurrency: row.concurrency ?? 4,
  };
  cache.set(agent, { value: cfg, expires: Date.now() + TTL_MS });
  return cfg;
}

// Merge agent config into a partial LlmCallOptions. Caller-provided values win.
export async function applyAgentOverrides<T extends { agent: AgentName; model?: string; temperature?: number; maxOutputTokens?: number }>(
  opts: T,
): Promise<T & { _resolved: AgentConfig }> {
  const cfg = await resolveAgentConfig(opts.agent);
  return {
    ...opts,
    model: opts.model ?? cfg.model,
    temperature: opts.temperature ?? cfg.temperature,
    maxOutputTokens: opts.maxOutputTokens ?? cfg.max_output_tokens,
    _resolved: cfg,
  };
}
