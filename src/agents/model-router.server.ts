// Hardware-aware model router - maps each agent to the optimal local model.
//
// Hardware profile: Intel i7-7700 (4C/8T), 51GB RAM, GTX 1070 8GB VRAM
// Strategy:
//   - Small models (phi4-mini 2.5GB, qwen3:4b 2.5GB) for high-throughput agents
//   - Dolphin3 (uncensored 4.9GB) for evaluator/critic (honest scoring)
//   - qwen3:14b (9.3GB, CPU offload) only for strategist/writer (reasoning depth)
//   - nomic-embed-text (274MB) for embeddings (unchanged)

import type { AgentName } from "@/lib/agent-config.server";

export type ModelAssignment = {
  primary: string;
  fallback: string | null;
  reason: string;
};

export const AGENT_MODEL_MAP: Record<AgentName, ModelAssignment> = {
  discoverer: {
    primary: "phi4-mini:latest",
    fallback: "dolphin3:latest",
    reason:
      "Alto volumen, extracción estructurada. Velocidad > calidad. Phi-4-mini carga rápido (2.5GB, ~3.9GB VRAM).",
  },
  enricher: {
    primary: "phi4-mini:latest",
    fallback: "dolphin3:latest",
    reason:
      "Batch field filling, JSON mode, throughput crítico. Phi-4-mini con temperatura 0.1 para output determinista.",
  },
  evaluator: {
    primary: "dolphin3:latest",
    fallback: "phi4-mini:latest",
    reason:
      "Fit scoring necesita evaluación honesta. Dolphin3 sin censura = sin inflación de scores. Deterministic rules hacen el trabajo pesado.",
  },
  strategist: {
    primary: "dolphin3:latest",
    fallback: "qwen3:14b",
    reason:
      "dolphin3 (4.9GB) CABE en la GTX 1070 8GB y responde en segundos; qwen3:14b (9.3GB) hace CPU-offload y tardó ~114s en cargar+generar UNA palabra → cuelga el flujo interactivo de Draft. Razonamiento suficiente para planificar propuesta. qwen3:14b queda como fallback para GPUs mayores.",
  },
  writer: {
    primary: "dolphin3:latest",
    fallback: "qwen3:14b",
    reason:
      "Misma razón hardware que strategist: dolphin3 cabe en VRAM y genera prosa fluida en segundos. qwen3:14b sólo viable con más VRAM (fallback).",
  },
  critic: {
    primary: "dolphin3:latest",
    fallback: "qwen3:14b",
    reason: "Crítica sin filtro. Dolphin3 uncensored = reviews honestos sin politeness bias.",
  },
};

export function resolveModel(agent: AgentName, preferFallback = false): string {
  const assignment = AGENT_MODEL_MAP[agent];
  if (!assignment) return process.env.OLLAMA_MODEL || "phi4-mini:latest";
  return preferFallback && assignment.fallback ? assignment.fallback : assignment.primary;
}

export function resolveFallback(agent: AgentName): string | null {
  return AGENT_MODEL_MAP[agent]?.fallback ?? null;
}

export function getModelReason(agent: AgentName): string {
  return AGENT_MODEL_MAP[agent]?.reason ?? "";
}
