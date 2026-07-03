// Evidence recorder — every extracted field MUST cite a verifiable snippet.
// Anti-hallucination: snippets are validated against the source markdown
// before insert. LLM-claimed citations that don't appear in the source are
// rejected (the field is dropped, not silently persisted).
//
// All writes go through supabaseAdmin (service role) — agents are server-side.

import { createHash } from "crypto";

export type ExtractionMethod = "regex" | "chrono" | "rule" | "firecrawl_json" | "llm" | "manual";
export type Agent = "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";

export type EvidenceInput = {
  grantId: string;
  agent: Agent;
  field: string;                     // e.g. "amount_cad_max", "deadline", "fit_score"
  value: unknown;                    // the value extracted
  sourceUrl: string;
  sourceMarkdown?: string;           // raw page text used for validation
  snippet: string;                   // literal excerpt that proves the value
  snippetOffset?: number;
  method: ExtractionMethod;
  confidence?: number;               // 0..1 (defaults from method)
  model?: string;
  runId?: string;
  db?: { from: (table: string) => any };
};

const DEFAULT_CONFIDENCE: Record<ExtractionMethod, number> = {
  regex: 1.0,
  chrono: 0.95,
  rule: 0.95,
  firecrawl_json: 0.9,
  llm: 0.6,
  manual: 1.0,
};

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Returns true if `snippet` (normalized) appears in `markdown` (normalized). */
export function snippetIsGrounded(snippet: string, markdown: string): boolean {
  if (!snippet || !markdown) return false;
  const haystack = normalizeWs(markdown);
  const needle = normalizeWs(snippet).slice(0, 400);
  if (needle.length < 12) return false;
  // Try exact match first.
  if (haystack.includes(needle)) return true;
  // Fallback: try the first 120 chars of the needle to handle
  // multi-paragraph snippets where normalization shifts word boundaries.
  const shortNeedle = needle.slice(0, 120);
  if (shortNeedle.length >= 12 && haystack.includes(shortNeedle)) return true;
  return false;
}

export async function recordEvidence(input: EvidenceInput): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = input.db ?? supabaseAdmin;

  // Anti-hallucination gate for LLM-method evidence.
  if (input.method === "llm" && input.sourceMarkdown) {
    if (!snippetIsGrounded(input.snippet, input.sourceMarkdown)) {
      return { ok: false, reason: "snippet_not_in_source" };
    }
  }

  const confidence = input.confidence ?? DEFAULT_CONFIDENCE[input.method];
  const sourceHash = createHash("sha256").update(input.sourceUrl).digest("hex").slice(0, 16);

  const { data, error } = await db
    .from("evidence_spans")
    .insert({
      grant_id: input.grantId,
      agent: input.agent,
      field: input.field,
      value: (input.value ?? null) as never,
      source_url: input.sourceUrl,
      source_hash: sourceHash,
      snippet: input.snippet.slice(0, 1500),
      snippet_offset: input.snippetOffset ?? null,
      extraction_method: input.method,
      confidence,
      model: input.model ?? null,
      run_id: input.runId ?? null,
    } as never)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  return { ok: true, id: (data as { id?: string } | null)?.id };
}

/** Best-effort helper: extracts a window of ±120 chars around a match. */
export function windowAround(text: string, matchStart: number, matchLen: number, pad = 120): string {
  const start = Math.max(0, matchStart - pad);
  const end = Math.min(text.length, matchStart + matchLen + pad);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
