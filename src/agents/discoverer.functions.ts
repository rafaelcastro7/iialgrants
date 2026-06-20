import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { DiscovererOutput, PROMPTS } from "@/agents/schemas";

// Discoverer agent (Phase 1). Fetches a funder source URL, extracts the visible
// text, asks Gemini 2.5 Flash to identify grant programs, validates with Zod,
// and upserts into public.grants. Idempotent via source_hash (sha256 of url+title).
export const runDiscoverer = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ funderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { callLlm } = await import("@/agents/llm.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newRunId } = await import("@/lib/otel");

    const runId = newRunId();
    const runStart = Date.now();

    const { data: funder, error: ferr } = await supabaseAdmin
      .from("funders")
      .select("id, name, source_url, source_type")
      .eq("id", data.funderId)
      .maybeSingle();
    if (ferr) throw new Error(`funder_lookup_failed: ${ferr.message}`);
    if (!funder?.source_url) throw new Error("funder_has_no_source_url");

    // Reuse history: look up prior fetch metadata for conditional GET.
    const { data: prior } = await supabaseAdmin
      .from("discovery_sources" as never)
      .select("id, content_hash, etag, last_modified, times_seen")
      .eq("funder_id", funder.id)
      .eq("url", funder.source_url)
      .maybeSingle();
    const priorRow = prior as
      | { id: string; content_hash: string | null; etag: string | null; last_modified: string | null; times_seen: number }
      | null;

    // Fetch the source page. Conservative: 8s timeout, 250KB cap. Send
    // conditional headers when we have them so unchanged pages return 304.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let raw = "";
    let httpStatus = 0;
    let resEtag: string | null = null;
    let resLastModified: string | null = null;
    try {
      const condHeaders: Record<string, string> = {
        "User-Agent": "IIAL/0.1 (+https://iial.ca)",
      };
      if (priorRow?.etag) condHeaders["If-None-Match"] = priorRow.etag;
      if (priorRow?.last_modified) condHeaders["If-Modified-Since"] = priorRow.last_modified;
      const res = await fetch(funder.source_url, { signal: ctrl.signal, headers: condHeaders });
      httpStatus = res.status;
      resEtag = res.headers.get("etag");
      resLastModified = res.headers.get("last-modified");
      if (res.status === 304) {
        // Page unchanged — refresh history, skip LLM call, mark recurring grants as seen.
        await supabaseAdmin.from("discovery_sources" as never).update({
          http_status: 304,
          last_fetched_at: new Date().toISOString(),
          times_seen: (priorRow?.times_seen ?? 0) + 1,
        } as never).eq("id", priorRow!.id);
        await supabaseAdmin.from("agent_runs").insert({
          run_id: runId,
          agent: "discoverer",
          status: "succeeded",
          model: "n/a",
          latency_ms: Date.now() - runStart,
          metadata: { funder_id: funder.id, cached: true, reason: "304_not_modified" },
        });
        return { ok: true, inserted: 0, runId, cached: true };
      }
      if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
      raw = (await res.text()).slice(0, 250_000);
    } finally {
      clearTimeout(timer);
    }

    // Strip tags / scripts for a leaner LLM prompt (degraded but cheap).
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000);

    const contentHash = createHash("sha256").update(text).digest("hex");

    // Content-hash short-circuit: same body as last time → no LLM call.
    if (priorRow && priorRow.content_hash === contentHash) {
      await supabaseAdmin.from("discovery_sources" as never).update({
        http_status: httpStatus,
        text_length: text.length,
        last_fetched_at: new Date().toISOString(),
        times_seen: priorRow.times_seen + 1,
      } as never).eq("id", priorRow.id);
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "discoverer",
        status: "succeeded",
        model: "n/a",
        latency_ms: Date.now() - runStart,
        metadata: { funder_id: funder.id, cached: true, reason: "hash_unchanged" },
      });
      return { ok: true, inserted: 0, runId, cached: true };
    }

    // Degraded mode: empty page -> no-op, don't burn tokens.
    if (text.length < 200) {
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "discoverer",
        status: "degraded",
        model: "google/gemini-2.5-flash",
        latency_ms: Date.now() - runStart,
        error: "page_too_short",
        metadata: { funder_id: funder.id, text_len: text.length },
      });
      return { ok: true, inserted: 0, runId, degraded: true };
    }

    const llm = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "discoverer",
      runId,
      temperature: 0.1,
      responseFormat: "json",
      messages: [
        { role: "system", content: `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}` },
        {
          role: "user",
          content:
            `Funder: ${funder.name}\nSource URL: ${funder.source_url}\n\n` +
            `Page text:\n${text}\n\n` +
            `Return JSON: { "grants": [ { "title", "title_fr"?, "summary"?, "summary_fr"?, ` +
            `"amount_cad_min"?, "amount_cad_max"?, "deadline"?, "eligibility"?, "sectors"?, ` +
            `"language", "url" } ] }`,
        },
      ],
    });

    let parsed: ReturnType<typeof DiscovererOutput.parse>;
    try {
      parsed = DiscovererOutput.parse(JSON.parse(llm.text));
    } catch (e) {
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "discoverer",
        status: "failed",
        model: "google/gemini-2.5-flash",
        input_tokens: llm.inputTokens,
        output_tokens: llm.outputTokens,
        latency_ms: Date.now() - runStart,
        error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { funder_id: funder.id },
      });
      return { ok: false, inserted: 0, runId, error: "schema_validation" };
    }

    let inserted = 0;
    let seenAgain = 0;
    for (const g of parsed.grants) {
      const source_hash = createHash("sha256")
        .update(`${g.url}|${g.title}`)
        .digest("hex");
      const { data: existing } = await supabaseAdmin
        .from("grants")
        .select("id, times_seen")
        .eq("source_hash", source_hash)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("grants")
          .update({
            last_seen_at: new Date().toISOString(),
            times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
          } as never)
          .eq("id", existing.id);
        seenAgain++;
        continue;
      }
      const { error: ierr } = await supabaseAdmin.from("grants").insert({
        funder_id: funder.id,
        title: g.title,
        title_fr: g.title_fr ?? null,
        summary: g.summary ?? null,
        summary_fr: g.summary_fr ?? null,
        amount_cad_min: g.amount_cad_min ?? null,
        amount_cad_max: g.amount_cad_max ?? null,
        deadline: g.deadline ?? null,
        eligibility: (g.eligibility ?? {}) as Record<string, unknown> as never,
        sectors: g.sectors ?? [],
        language: g.language,
        url: g.url,
        source_hash,
        status: "discovered",
      });
      if (!ierr) inserted++;
    }

    // Cache discovery_sources history for future runs.
    await supabaseAdmin.from("discovery_sources" as never).upsert(
      {
        funder_id: funder.id,
        url: funder.source_url,
        content_hash: contentHash,
        etag: resEtag,
        last_modified: resLastModified,
        http_status: httpStatus,
        text_length: text.length,
        grants_found: parsed.grants.length,
        grants_inserted: inserted,
        times_seen: (priorRow?.times_seen ?? 0) + 1,
        last_fetched_at: new Date().toISOString(),
      } as never,
      { onConflict: "funder_id,url" },
    );

    // Refresh funder freshness fields.
    await supabaseAdmin
      .from("funders")
      .update({
        last_discovered_at: new Date().toISOString(),
        last_content_hash: contentHash,
      } as never)
      .eq("id", funder.id);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId,
      agent: "discoverer",
      status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - runStart,
      metadata: { funder_id: funder.id, found: parsed.grants.length, inserted, seen_again: seenAgain },
    });

    return { ok: true, inserted, found: parsed.grants.length, seenAgain, runId };
  });
