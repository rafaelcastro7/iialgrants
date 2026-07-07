import { enrichGrantImpl } from "@/agents/enricher.functions";
import { evaluateGrantImpl } from "@/agents/evaluator.impl.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BatchResult = {
  grantId: string;
  title: string;
  status: string;
  enrich?: { ok: boolean; error?: string; reason?: string; filled?: string[] };
  evaluate?: { ok: boolean; error?: string; fit_score?: number; eligibility_pass?: boolean };
  improvements: string[];
};

export async function batchEnrichDiscovered(adminUserId: string, limit = 49): Promise<BatchResult[]> {
  const { data: grants } = await supabaseAdmin
    .from("grants")
    .select("id, title, status, enrich_attempts, enrich_last_error")
    .in("status", ["discovered"])
    .order("created_at", { ascending: true })
    .limit(limit);

  const results: BatchResult[] = [];
  for (const grant of grants ?? []) {
    const result: BatchResult = {
      grantId: grant.id,
      title: grant.title ?? "(untitled)",
      status: grant.status,
      improvements: [],
    };

    try {
      const r = await enrichGrantImpl(grant.id, { db: supabaseAdmin, userId: adminUserId });
      result.enrich = { ok: r.ok, error: r.error, reason: r.reason, filled: r.filled };
      if (!r.ok) {
        result.improvements.push(`Enrichment failed: ${r.error ?? r.reason}`);
      } else if (r.skipped) {
        result.improvements.push(`Skipped: ${r.reason}`);
      } else {
        console.log(`  [OK]   ${grant.id.slice(0, 8)} enriched: ${(r.filled ?? []).join(", ") || "nothing new"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.enrich = { ok: false, error: msg };
      result.improvements.push(`Enrichment threw: ${msg}`);
      analyzeError(msg, result);
    }

    results.push(result);
  }

  const enriched = results.filter((r) => r.enrich?.ok);
  console.log(`\nEnrichment complete: ${enriched.length}/${results.length} succeeded`);
  return results;
}

export async function batchEvaluateAll(adminUserId: string): Promise<BatchResult[]> {
  const { data: grants } = await supabaseAdmin
    .from("grants")
    .select("id, title, status")
    .in("status", ["enriched", "scored"])
    .order("fit_score", { ascending: false, nullsFirst: false });

  const results: BatchResult[] = [];
  for (const grant of grants ?? []) {
    const result: BatchResult = {
      grantId: grant.id,
      title: grant.title ?? "(untitled)",
      status: grant.status,
      improvements: [],
    };

    try {
      const r = await evaluateGrantImpl({
        grantId: grant.id,
        userId: adminUserId,
        userSupabase: supabaseAdmin as never,
      });
      result.evaluate = {
        ok: true,
        fit_score: r.fit_score,
        eligibility_pass: r.eligibility_pass,
      };
      console.log(`  [OK]   ${grant.id.slice(0, 8)} scored: ${r.fit_score?.toFixed(3)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.evaluate = { ok: false, error: msg };
      result.improvements.push(`Evaluation threw: ${msg}`);
      analyzeError(msg, result);
    }

    results.push(result);
  }

  const scored = results.filter((r) => r.evaluate?.ok);
  console.log(`\nEvaluation complete: ${scored.length}/${results.length} succeeded`);
  return results;
}

function analyzeError(msg: string, result: BatchResult) {
  if (msg.includes("grant_not_found")) {
    result.improvements.push("SYSTEM: grant was deleted mid-processing");
  }
  if (msg.includes("agent_disabled")) {
    result.improvements.push("SYSTEM: agent disabled in agent_flags table");
  }
  if (msg.includes("grant_not_enriched_yet")) {
    result.improvements.push("SYSTEM: enrichment required before evaluation");
  }
  if (msg.includes("timeout") || msg.includes("TIMEOUT")) {
    result.improvements.push("SYSTEM: consider increasing fetch timeout in web-fetch.server.ts");
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("ECONNREFUSED")) {
    result.improvements.push("SYSTEM: funder URL is unreachable — check source_url");
  }
  if (msg.includes("rate_limited") || msg.includes("429")) {
    result.improvements.push("SYSTEM: rate limited by LLM provider — increase retry delay");
  }
  if (msg.includes("scrape") || msg.includes("extract")) {
    result.improvements.push("SYSTEM: content extraction failed — page format may have changed");
  }
  if (msg.includes("schema") || msg.includes("validation") || msg.includes("parse")) {
    result.improvements.push("SYSTEM: LLM returned invalid schema — inspect prompt");
  }
  if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("source_hash")) {
    result.improvements.push("SYSTEM: duplicate grant detected — dedup check passed incorrectly");
  }
  if (msg.includes("not_authenticated") || msg.includes("JWT")) {
    result.improvements.push("SYSTEM: auth failure — check Supabase service role key");
  }
  if (msg.includes("ollama") || msg.includes("localhost")) {
    result.improvements.push("SYSTEM: Ollama unavailable — ensure ollama is running on localhost:11434");
  }
}
