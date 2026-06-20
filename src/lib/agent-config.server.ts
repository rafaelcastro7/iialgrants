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
  system_prompt: string;       // resolved (override OR built-in)
  builtin_prompt: string;      // built-in for diff/reset
  has_override: boolean;
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

  const row = (data ?? {}) as Record<string, unknown>;
  const builtin = (PROMPTS as Record<string, { system: string; version: string }>)[agent]?.system ?? "";
  const override = typeof row.system_prompt === "string" && row.system_prompt.trim().length > 0
    ? (row.system_prompt as string) : null;

  const cfg: AgentConfig = {
    agent,
    model: (row.model as string) ?? "google/gemini-2.5-flash",
    fallback_model: (row.fallback_model as string) ?? null,
    temperature: Number(row.temperature ?? 0.2),
    top_p: Number(row.top_p ?? 1.0),
    max_output_tokens: Number(row.max_output_tokens ?? 2048),
    json_mode: (row.json_mode as boolean) ?? true,
    system_prompt: override ?? builtin,
    builtin_prompt: builtin,
    has_override: !!override,
    prompt_version: (row.prompt_version as string) ?? "1.0.0",
    timeout_ms: Number(row.timeout_ms ?? 60000),
    max_retries: Number(row.max_retries ?? 2),
    concurrency: Number(row.concurrency ?? 4),
  };
  cache.set(agent, { value: cfg, expires: Date.now() + TTL_MS });
  return cfg;
}
