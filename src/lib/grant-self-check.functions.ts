// Per-grant self-check + fetch-trail server functions.
//
// Both run on the authenticated session (RLS scoped). They expose:
//   - selfCheckGrant({grantId}) — quick wiring report so the detail page can
//     show a green/amber/red badge BEFORE rendering details.
//   - getFetchTrail({grantId}) — returns the last enricher run's
//     metadata.fetch_attempts array so the UI can show the exact engines
//     that ran, with timestamps and HTTP status.
//
// Both are read-only and safe to call on every page load.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SelfCheckIssue = { id: string; level: "ok" | "warn" | "error"; label: string; hint?: string };
export type SelfCheckReport = {
  grantId: string;
  overall: "ok" | "warn" | "error";
  issues: SelfCheckIssue[];
  fields: { amount: boolean; deadline: boolean; sectors: boolean; eligibility: boolean; summary: boolean };
  evidence_count: number;
  enriched: boolean;
  last_enrich_error: string | null;
  last_enrich_at: string | null;
  enrich_attempts: number;
};

export const selfCheckGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ grantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<SelfCheckReport> => {
    const { supabase } = context;
    const { data: g, error } = await supabase
      .from("grants")
      .select("id, title, summary, url, status, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, funder_id, enriched_at, enrich_attempts, enrich_last_error, enrich_last_attempt_at")
      .eq("id", data.grantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) throw new Error("grant_not_found");

    const { count: evCount } = await supabase
      .from("evidence_spans")
      .select("id", { count: "exact", head: true })
      .eq("grant_id", data.grantId);

    const fields = {
      amount: g.amount_cad_min != null || g.amount_cad_max != null,
      deadline: !!g.deadline,
      sectors: Array.isArray(g.sectors) && g.sectors.length > 0,
      eligibility: !!g.eligibility && Object.keys(g.eligibility as Record<string, unknown>).length > 0,
      summary: !!g.summary && (g.summary as string).length > 40,
    };

    const issues: SelfCheckIssue[] = [];
    if (!g.url) issues.push({ id: "no_url", level: "error", label: "Source URL missing — cannot fetch" });
    if (!g.funder_id) issues.push({ id: "no_funder", level: "warn", label: "Grant not linked to a funder record" });
    if (!g.enriched_at) issues.push({ id: "not_enriched", level: "warn", label: "Details not yet fetched", hint: "Click 'Fetch details' to scrape now" });
    if (g.enriched_at && !fields.summary) issues.push({ id: "no_summary", level: "warn", label: "Summary missing after enrichment" });
    if (g.enriched_at && !fields.amount) issues.push({ id: "no_amount", level: "warn", label: "Amount missing — extractor found nothing" });
    if (g.enriched_at && !fields.deadline) issues.push({ id: "no_deadline", level: "warn", label: "Deadline missing — page may be open-rolling" });
    if (g.enriched_at && (evCount ?? 0) === 0) issues.push({ id: "no_evidence", level: "warn", label: "No evidence citations recorded" });
    if (g.enrich_last_error) issues.push({ id: "last_err", level: "error", label: `Last fetch error: ${(g.enrich_last_error as string).slice(0, 120)}` });

    const overall: "ok" | "warn" | "error" = issues.some(i => i.level === "error")
      ? "error"
      : issues.some(i => i.level === "warn") ? "warn" : "ok";

    return {
      grantId: data.grantId,
      overall,
      issues,
      fields,
      evidence_count: evCount ?? 0,
      enriched: !!g.enriched_at,
      last_enrich_error: (g.enrich_last_error as string | null) ?? null,
      last_enrich_at: (g.enrich_last_attempt_at as string | null) ?? g.enriched_at,
      enrich_attempts: (g.enrich_attempts as number | null) ?? 0,
    };
  });

export type FetchAttemptRow = {
  engine: string;
  ok: boolean;
  http_status?: number;
  latency_ms: number;
  error?: string;
  url_used?: string;
  bytes?: number;
  ts: string;
};

export type FetchTrail = {
  grantId: string;
  runId: string | null;
  agent: string | null;
  status: string | null;
  startedAt: string | null;
  totalLatencyMs: number | null;
  attempts: FetchAttemptRow[];
  nextRetryAfter: string | null;
};

export const getFetchTrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ grantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<FetchTrail> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("agent_runs")
      .select("run_id, agent, status, started_at, latency_ms, metadata")
      .eq("grant_id", data.grantId)
      .eq("agent", "enricher")
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) {
      return { grantId: data.grantId, runId: null, agent: null, status: null, startedAt: null, totalLatencyMs: null, attempts: [], nextRetryAfter: null };
    }
    const meta = (row.metadata ?? {}) as { fetch_attempts?: FetchAttemptRow[] };
    const attempts = Array.isArray(meta.fetch_attempts) ? meta.fetch_attempts : [];

    // Compute next-retry suggestion: exponential cool-down based on
    // consecutive failures recorded on the grant row.
    const { data: g } = await supabase
      .from("grants")
      .select("enrich_attempts, enrich_last_attempt_at")
      .eq("id", data.grantId).maybeSingle();
    let nextRetryAfter: string | null = null;
    if (row.status === "failed" && g?.enrich_last_attempt_at) {
      const attempts_n = (g.enrich_attempts as number | null) ?? 1;
      const coolMin = Math.min(60, Math.pow(2, attempts_n));
      nextRetryAfter = new Date(new Date(g.enrich_last_attempt_at as string).getTime() + coolMin * 60_000).toISOString();
    }
    return {
      grantId: data.grantId,
      runId: row.run_id as string,
      agent: row.agent as string,
      status: row.status as string,
      startedAt: (row.started_at as string) ?? null,
      totalLatencyMs: (row.latency_ms as number | null) ?? null,
      attempts,
      nextRetryAfter,
    };
  });
