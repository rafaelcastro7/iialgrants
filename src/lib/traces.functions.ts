import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Fetches the live chain-of-thought trace for a single agent run.
// Polled every ~1s by AgentTracePanel.
export type TraceStepDTO = {
  id: string;
  run_id: string;
  grant_id: string | null;
  agent: string;
  step: string;
  status: string;
  message: string | null;
  payload: string | null; // JSON-stringified for SSR serializability
  duration_ms: number | null;
  created_at: string;
};

export const getAgentTrace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ runId: z.string().min(4) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_trace_steps")
      .select(
        "id, run_id, grant_id, agent, step, status, message, payload, duration_ms, created_at",
      )
      .eq("run_id", data.runId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const steps: TraceStepDTO[] = (rows ?? []).map((r) => ({
      id: r.id,
      run_id: r.run_id,
      grant_id: r.grant_id,
      agent: r.agent,
      step: r.step,
      status: r.status,
      message: r.message,
      payload: r.payload == null ? null : JSON.stringify(r.payload),
      duration_ms: r.duration_ms,
      created_at: r.created_at,
    }));
    return { steps };
  });

// Latest run for a grant — used to auto-select the freshest trace when the
// user opens the panel without an explicit runId.
export const getLatestRunForGrant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        grantId: z.string().uuid(),
        agent: z
          .enum(["enricher", "evaluator", "strategist", "writer", "critic", "discoverer"])
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("agent_trace_steps")
      .select("run_id, agent, created_at")
      .eq("grant_id", data.grantId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.agent) q = q.eq("agent", data.agent);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const first = (rows ?? [])[0];
    return { runId: first?.run_id ?? null, agent: first?.agent ?? null };
  });
