// OpenTelemetry GenAI-style structured logging with optional OTLP export.
// - Console JSON line: always emitted (collectable by any log shipper).
// - OTLP/HTTP /v1/logs export: enabled when OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
//   is set. Fire-and-forget; failures are swallowed so they never break a
//   user-facing request.
// Ref: https://opentelemetry.io/docs/specs/semconv/gen-ai/

export type GenAIEvent = {
  "gen_ai.system":
  | "google.gemini"
  | "openai"
  | "ollama"
  | "groq"
  | "free.groq"
  | "free.gemini"
  | "free.cerebras"
  | "free.ollama";
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

function nowNs(): string {
  return String(BigInt(Date.now()) * 1_000_000n);
}

function severity(ok: boolean): { number: number; text: string } {
  return ok ? { number: 9, text: "INFO" } : { number: 17, text: "ERROR" };
}

function toOtlpLog(evt: GenAIEvent) {
  const attrs: Array<{
    key: string;
    value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean };
  }> = [];
  for (const [k, v] of Object.entries(evt)) {
    if (v == null) continue;
    if (typeof v === "string") attrs.push({ key: k, value: { stringValue: v } });
    else if (typeof v === "number")
      attrs.push({
        key: k,
        value: Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v },
      });
    else if (typeof v === "boolean") attrs.push({ key: k, value: { boolValue: v } });
    else attrs.push({ key: k, value: { stringValue: JSON.stringify(v) } });
  }
  const sev = severity(evt.ok);
  return {
    resourceLogs: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "iial" } }] },
        scopeLogs: [
          {
            scope: { name: "gen_ai" },
            logRecords: [
              {
                timeUnixNano: nowNs(),
                severityNumber: sev.number,
                severityText: sev.text,
                body: { stringValue: `${evt.agent} ${evt["gen_ai.operation.name"]}` },
                attributes: attrs,
              },
            ],
          },
        ],
      },
    ],
  };
}

async function exportOtlp(evt: GenAIEvent) {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
  if (!endpoint) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OTEL_EXPORTER_OTLP_HEADERS_AUTH
          ? { Authorization: process.env.OTEL_EXPORTER_OTLP_HEADERS_AUTH }
          : {}),
      },
      body: JSON.stringify(toOtlpLog(evt)),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    /* swallow — observability must never break requests */
  }
}

export function logGenAI(evt: GenAIEvent) {
  console.log(JSON.stringify({ kind: "gen_ai", ts: new Date().toISOString(), ...evt }));
  // Fire-and-forget OTLP export (no await — handler returns promptly).
  void exportOtlp(evt);
}

export function newRunId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
