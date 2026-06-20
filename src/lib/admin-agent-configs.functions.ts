import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type AgentConfigRow = {
  agent: string;
  enabled: boolean;
  description: string;
  model: string;
  fallback_model: string | null;
  temperature: number;
  top_p: number;
  max_output_tokens: number;
  json_mode: boolean;
  system_prompt: string | null;
  builtin_prompt: string;
  prompt_version: string;
  timeout_ms: number;
  max_retries: number;
  concurrency: number;
  updated_at: string;
  updated_by: string | null;
  stats: { runs_24h: number; success_rate: number; avg_latency_ms: number; total_tokens_24h: number };
};

const AGENTS = ["discoverer", "enricher", "evaluator", "strategist", "writer", "critic"] as const;

// Curated catalog from Lovable AI Gateway (free tier covers Gemini family).
export const MODEL_CATALOG = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "free", notes: "Fast, JSON-native, default." },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "free", notes: "Higher reasoning; slower." },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", tier: "free", notes: "Cheapest; weakest." },
  { id: "openai/gpt-5", label: "GPT-5", tier: "paid", notes: "Premium reasoning." },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", tier: "paid", notes: "Balanced cost/quality." },
  { id: "openai/gpt-5-nano", label: "GPT-5 Nano", tier: "paid", notes: "Cheapest OpenAI." },
] as const;

export const listAgentConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAgentConfig, invalidateAgentConfigCache } = await import("@/lib/agent-config.server");
    invalidateAgentConfigCache();
    const { data: flags } = await context.supabase
      .from("agent_flags" as never)
      .select("agent, enabled, description, updated_at, updated_by");
    const flagsMap = new Map<string, { enabled: boolean; description: string; updated_at: string; updated_by: string | null }>(
      ((flags ?? []) as Array<{ agent: string; enabled: boolean; description: string; updated_at: string; updated_by: string | null }>)
        .map((f) => [f.agent, f]),
    );

    // 24h rolling stats per agent.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: runs } = await context.supabase
      .from("agent_runs")
      .select("agent, status, latency_ms, input_tokens, output_tokens")
      .gte("created_at", since);
    const statsBy = new Map<string, { n: number; ok: number; lat: number; tok: number }>();
    for (const r of ((runs ?? []) as Array<{ agent: string; status: string; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null }>)) {
      const s = statsBy.get(r.agent) ?? { n: 0, ok: 0, lat: 0, tok: 0 };
      s.n++;
      if (r.status === "succeeded") s.ok++;
      s.lat += r.latency_ms ?? 0;
      s.tok += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      statsBy.set(r.agent, s);
    }

    const out: AgentConfigRow[] = [];
    for (const a of AGENTS) {
      const cfg = await resolveAgentConfig(a);
      const f = flagsMap.get(a);
      const s = statsBy.get(a);
      out.push({
        agent: a,
        enabled: f?.enabled ?? true,
        description: f?.description ?? "",
        model: cfg.model,
        fallback_model: cfg.fallback_model,
        temperature: cfg.temperature,
        top_p: cfg.top_p,
        max_output_tokens: cfg.max_output_tokens,
        json_mode: cfg.json_mode,
        system_prompt: cfg.has_override ? cfg.system_prompt : null,
        builtin_prompt: cfg.builtin_prompt,
        prompt_version: cfg.prompt_version,
        timeout_ms: cfg.timeout_ms,
        max_retries: cfg.max_retries,
        concurrency: cfg.concurrency,
        updated_at: f?.updated_at ?? new Date().toISOString(),
        updated_by: f?.updated_by ?? null,
        stats: {
          runs_24h: s?.n ?? 0,
          success_rate: s && s.n > 0 ? s.ok / s.n : 0,
          avg_latency_ms: s && s.n > 0 ? Math.round(s.lat / s.n) : 0,
          total_tokens_24h: s?.tok ?? 0,
        },
      });
    }
    return { agents: out, models: MODEL_CATALOG };
  });

const UpdateInput = z.object({
  agent: z.enum(AGENTS),
  model: z.string().min(2).optional(),
  fallback_model: z.string().min(2).nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_output_tokens: z.number().int().min(64).max(32000).optional(),
  json_mode: z.boolean().optional(),
  system_prompt: z.string().max(20000).nullable().optional(),
  prompt_version: z.string().min(1).max(32).optional(),
  timeout_ms: z.number().int().min(5000).max(300000).optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
});

export const updateAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateAgentConfigCache } = await import("@/lib/agent-config.server");
    const { agent, ...patch } = data;

    // Load current row so we can write a per-field audit diff.
    const { data: before } = await supabaseAdmin
      .from("agent_configs" as never)
      .select("*").eq("agent", agent).maybeSingle();
    const prev = (before ?? {}) as Record<string, unknown>;

    const update: Record<string, unknown> = { ...patch, updated_by: context.userId };
    const { error } = await supabaseAdmin
      .from("agent_configs" as never)
      .update(update as never)
      .eq("agent", agent);
    if (error) throw new Error(error.message);
    invalidateAgentConfigCache(agent);

    // Per-field audit rows (only when actually changed).
    const auditRows: Array<Record<string, unknown>> = [];
    for (const [field, newVal] of Object.entries(patch)) {
      const oldVal = prev[field];
      if (JSON.stringify(oldVal ?? null) === JSON.stringify(newVal ?? null)) continue;
      auditRows.push({
        agent, user_id: context.userId, field,
        old_value: oldVal ?? null,
        new_value: newVal ?? null,
        is_prompt: field === "system_prompt",
      });
    }
    if (auditRows.length > 0) {
      await supabaseAdmin.from("agent_config_audit" as never).insert(auditRows as never);
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "agent.config_update",
      resource_type: "agent_config",
      resource_id: agent,
      metadata: { changed_fields: auditRows.map((r) => r.field) } as never,
    } as never);
    return { ok: true, changed: auditRows.length };
  });

export const listAgentConfigAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agent: z.enum(AGENTS), limit: z.number().int().min(1).max(100).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_config_audit" as never)
      .select("id, agent, user_id, changed_at, field, old_value, new_value, is_prompt")
      .eq("agent", data.agent)
      .order("changed_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);

    // Resolve user emails for display.
    const ids = Array.from(new Set(((rows ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id).filter(Boolean) as string[]));
    const emailById = new Map<string, string>();
    if (ids.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const uid of ids) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emailById.set(uid, u.user.email);
      }
    }
    type AuditRow = { id: string; user_id: string | null; changed_at: string; field: string; old_value: unknown; new_value: unknown; is_prompt: boolean };
    type AuditEvent = { id: string; user_id: string | null; changed_at: string; field: string; old_value: string | null; new_value: string | null; is_prompt: boolean; user_email: string | null };
    const events: AuditEvent[] = ((rows ?? []) as AuditRow[]).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      changed_at: r.changed_at,
      field: r.field,
      old_value: r.old_value == null ? null : typeof r.old_value === "string" ? r.old_value : JSON.stringify(r.old_value),
      new_value: r.new_value == null ? null : typeof r.new_value === "string" ? r.new_value : JSON.stringify(r.new_value),
      is_prompt: r.is_prompt,
      user_email: r.user_id ? emailById.get(r.user_id) ?? null : null,
    }));
    return { events };
  });



export const resetAgentPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agent: z.enum(AGENTS) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateAgentConfigCache } = await import("@/lib/agent-config.server");
    const { error } = await supabaseAdmin
      .from("agent_configs" as never)
      .update({ system_prompt: null, updated_by: context.userId } as never)
      .eq("agent", data.agent);
    if (error) throw new Error(error.message);
    invalidateAgentConfigCache(data.agent);
    return { ok: true };
  });

export const testAgentPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      agent: z.enum(AGENTS),
      user_message: z.string().min(1).max(8000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { resolveAgentConfig } = await import("@/lib/agent-config.server");
    const { callLlm } = await import("@/agents/llm.server");
    const cfg = await resolveAgentConfig(data.agent);
    const t0 = Date.now();
    try {
      const res = await callLlm({
        agent: data.agent,
        model: cfg.model,
        temperature: cfg.temperature,
        maxOutputTokens: cfg.max_output_tokens,
        responseFormat: cfg.json_mode ? "json" : undefined,
        messages: [
          { role: "system", content: cfg.system_prompt },
          { role: "user", content: data.user_message },
        ],
      });
      return {
        ok: true,
        text: res.text,
        latency_ms: Date.now() - t0,
        input_tokens: res.inputTokens ?? null,
        output_tokens: res.outputTokens ?? null,
        model: cfg.model,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        latency_ms: Date.now() - t0,
        model: cfg.model,
      };
    }
  });

export const listAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agent: z.enum(AGENTS), limit: z.number().int().min(1).max(50).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_runs")
      .select("run_id, agent, status, model, input_tokens, output_tokens, latency_ms, created_at, grant_id, metadata")
      .eq("agent", data.agent)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });
