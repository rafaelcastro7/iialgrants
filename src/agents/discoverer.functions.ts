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

    // Fetch the source page. Conservative: 8s timeout, 250KB cap.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let raw = "";
    try {
      const res = await fetch(funder.source_url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "IIAL/0.1 (+https://iial.ca)" },
      });
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
    for (const g of parsed.grants) {
      const source_hash = createHash("sha256")
        .update(`${g.url}|${g.title}`)
        .digest("hex");
      const { error: ierr } = await supabaseAdmin
        .from("grants")
        .upsert(
          {
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
          },
          { onConflict: "source_hash", ignoreDuplicates: true },
        );
      if (!ierr) inserted++;
    }

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId,
      agent: "discoverer",
      status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - runStart,
      metadata: { funder_id: funder.id, found: parsed.grants.length, inserted },
    });

    return { ok: true, inserted, found: parsed.grants.length, runId };
  });
