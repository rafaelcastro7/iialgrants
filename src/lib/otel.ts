// Minimal OpenTelemetry GenAI-style structured logging stub (Phase 0).
// Real OTLP exporter wires in Phase 1. Keeps semantic-convention keys stable
// from day one so dashboards/alerts don't need rework later.
// Ref: https://opentelemetry.io/docs/specs/semconv/gen-ai/

export type GenAIEvent = {
  "gen_ai.system": "google.gemini" | "openai" | "lovable.ai";
  "gen_ai.request.model": string;
  "gen_ai.operation.name": "chat" | "embedding" | "generate_content";
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.response.finish_reasons"?: string[];
  latency_ms: number;
  cost_usd?: number;
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
  run_id: string;
  user_id?: string;
  ok: boolean;
  error?: string;
};

export function logGenAI(evt: GenAIEvent) {
  // Structured JSON line — collectable by any log shipper.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ kind: "gen_ai", ts: new Date().toISOString(), ...evt }));
}

export function newRunId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
