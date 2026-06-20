// Live chain-of-thought trace. Each call inserts one step row that the UI
// polls in real time. Failures are swallowed — tracing must never break the
// underlying agent run.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TraceStatus = "info" | "ok" | "warn" | "error" | "start" | "done";

export type TraceInput = {
  runId: string;
  grantId?: string | null;
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
  step: string;
  status?: TraceStatus;
  message?: string;
  payload?: Record<string, unknown>;
  durationMs?: number;
};

export async function traceStep(input: TraceInput): Promise<void> {
  try {
    await supabaseAdmin.from("agent_trace_steps").insert({
      run_id: input.runId,
      grant_id: input.grantId ?? null,
      agent: input.agent,
      step: input.step,
      status: input.status ?? "info",
      message: input.message?.slice(0, 1000) ?? null,
      payload: (input.payload ?? null) as never,
      duration_ms: input.durationMs ?? null,
    } as never);
  } catch {
    /* tracing is best-effort */
  }
}

// Convenience: wraps an async block, emitting start/done/error steps and the
// measured duration. Returns the inner result (or rethrows).
export async function traced<T>(
  base: Omit<TraceInput, "status" | "durationMs">,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  await traceStep({ ...base, status: "start" });
  try {
    const out = await fn();
    await traceStep({ ...base, status: "done", durationMs: Date.now() - t0 });
    return out;
  } catch (e) {
    await traceStep({
      ...base, status: "error", durationMs: Date.now() - t0,
      message: (base.message ? base.message + " — " : "") + (e instanceof Error ? e.message : String(e)),
    });
    throw e;
  }
}
