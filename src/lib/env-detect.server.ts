"use server";

/**
 * Environment detection for IIAL Grants.
 * Auto-senses local (Ollama + self-hosted Supabase) vs Lovable Cloud (Supabase Cloud + Cloud LLMs only).
 */

export type RuntimeEnv = "local" | "lovable-cloud";

let _cachedEnv: RuntimeEnv | null = null;
let _ollamaReachable: boolean | null = null;

/**
 * Detects the runtime environment.
 * - Local: Ollama reachable at OLLAMA_BASE_URL (default localhost:11434)
 * - Lovable Cloud: Ollama not reachable, but Supabase Cloud + Cloud LLM keys present
 */
export async function detectRuntimeEnv(): Promise<RuntimeEnv> {
  if (_cachedEnv) return _cachedEnv;

  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  // Quick check: if OLLAMA_BASE_URL is not localhost, assume cloud with remote Ollama
  if (!ollamaUrl.includes("localhost") && !ollamaUrl.includes("127.0.0.1")) {
    _cachedEnv = "local"; // Could be remote Ollama, treat as local-like
    return _cachedEnv;
  }

  // Probe Ollama with short timeout
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    _ollamaReachable = res.ok;
  } catch {
    _ollamaReachable = false;
  }

  const hasCloudKeys = !!(
    process.env.CEREBRAS_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_KEY
  );

  // Local = Ollama reachable (regardless of cloud keys)
  // Cloud = Ollama NOT reachable + cloud keys present
  if (_ollamaReachable) {
    _cachedEnv = "local";
  } else if (hasCloudKeys) {
    _cachedEnv = "lovable-cloud";
  } else {
    // No Ollama, no cloud keys - degraded local
    _cachedEnv = "local";
  }

  return _cachedEnv;
}

/**
 * Returns true if running in Lovable Cloud (no Ollama, cloud LLMs only).
 */
export async function isLovableCloud(): Promise<boolean> {
  const env = await detectRuntimeEnv();
  return env === "lovable-cloud";
}

/**
 * Returns true if local Ollama is reachable.
 * Cached for 30s to avoid repeated probes.
 */
export async function isLocalOllamaAvailable(): Promise<boolean> {
  if (_ollamaReachable !== null) return _ollamaReachable;
  await detectRuntimeEnv(); // populates cache
  return _ollamaReachable ?? false;
}

/**
 * Returns a human-readable status for UI/health checks.
 */
export async function getRuntimeStatus(): Promise<{
  env: RuntimeEnv;
  ollamaReachable: boolean;
  ollamaUrl: string;
  hasCloudKeys: boolean;
  supabaseUrl: string;
}> {
  const env = await detectRuntimeEnv();
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const ollamaReachable = await isLocalOllamaAvailable();
  const hasCloudKeys = !!(
    process.env.CEREBRAS_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_KEY
  );

  return {
    env,
    ollamaReachable,
    ollamaUrl,
    hasCloudKeys,
    supabaseUrl: process.env.SUPABASE_URL || "not-set",
  };
}

/**
 * Clears cached detection (for testing).
 */
export function clearEnvCache(): void {
  _cachedEnv = null;
  _ollamaReachable = null;
}
