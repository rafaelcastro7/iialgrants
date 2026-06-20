import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { DiscoveredGrant, PROMPTS } from "@/agents/schemas";

// Discovery v2 — Per-page structured extraction.
//
// Strategy:
//   1. Map the funder index URL via Firecrawl to list candidate program URLs.
//   2. Filter those URLs to likely program pages (skip news/blog/PDF).
//   3. Scrape each candidate to clean markdown (JS rendered, no broken HTML).
//   4. For each page, ask the LLM to extract a SINGLE grant (small schema =
//      avoids "too many states" in Gemini constrained decoding).
//   5. Dedupe by canonical_key = sha256(funder_id|normalized_title|amount_band).
//
// Fallback (no FIRECRAWL_API_KEY): fetch the index URL, strip HTML, single
// extraction prompt (v1 behaviour). Lets demo run without the connector.

const MAX_PAGES_PER_RUN = 8;          // budget guard
const MAX_MARKDOWN_LEN = 18_000;      // per-page LLM context cap

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function canonicalKey(funderId: string, title: string, minAmt: number | null, maxAmt: number | null): string {
  const band = `${minAmt ?? "_"}_${maxAmt ?? "_"}`;
  return createHash("sha256").update(`${funderId}|${normalizeTitle(title)}|${band}`).digest("hex");
}

const SinglePageOutput = z.object({
  is_program: z.boolean(),
  grant: DiscoveredGrant.optional().nullable(),
});

export const runDiscoverer = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ funderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { callLlm } = await import("@/agents/llm.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newRunId } = await import("@/lib/otel");
    const { firecrawlAvailable, firecrawlMap, firecrawlScrape, filterProgramUrls } =
      await import("@/lib/firecrawl.server");

    const runId = newRunId();
    const t0 = Date.now();

    const { data: funder, error: ferr } = await supabaseAdmin
      .from("funders")
      .select("id, name, source_url, source_urls, source_type")
      .eq("id", data.funderId)
      .maybeSingle();
    if (ferr) throw new Error(`funder_lookup_failed: ${ferr.message}`);
    if (!funder?.source_url) throw new Error("funder_has_no_source_url");

    // ----- Path A: Firecrawl available → multi-page structured extraction -----
    if (firecrawlAvailable()) {
      const indexUrls: string[] = [funder.source_url, ...((funder as { source_urls?: string[] }).source_urls ?? [])];
      const mapped = new Set<string>();
      for (const idx of indexUrls) {
        const m = await firecrawlMap(idx, 50);
        if (m.ok) m.links.forEach((l) => mapped.add(l));
      }
      // Always include the index itself in case it IS the program page.
      indexUrls.forEach((u) => mapped.add(u));

      const origin = new URL(funder.source_url).origin;
      const candidates = filterProgramUrls([...mapped], origin).slice(0, MAX_PAGES_PER_RUN);

      let inserted = 0;
      let seenAgain = 0;
      let skipped = 0;

      for (const url of candidates) {
        const scrape = await firecrawlScrape(url);
        if (!scrape.ok) { skipped++; continue; }
        const md = scrape.markdown.slice(0, MAX_MARKDOWN_LEN);
        if (md.length < 400) { skipped++; continue; }

        const llm = await callLlm({
          model: "google/gemini-2.5-flash",
          agent: "discoverer",
          runId,
          temperature: 0.1,
          responseFormat: "json",
          messages: [
            { role: "system", content:
              `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}\n` +
              `You will analyze ONE web page and decide whether it describes ONE distinct ` +
              `Canadian funding program. If it does, extract it. If it is a directory, news ` +
              `or unrelated content, set is_program=false.` },
            { role: "user", content:
              `Funder: ${funder.name}\nPage URL: ${url}\nPage title: ${scrape.title ?? ""}\n\n` +
              `Markdown:\n${md}\n\n` +
              `Return JSON: { "is_program": boolean, "grant": { "title", "title_fr"?, "summary"?, ` +
              `"summary_fr"?, "amount_cad_min"?, "amount_cad_max"?, "deadline"?, "eligibility"?, ` +
              `"sectors"?, "language", "url" } | null }` },
          ],
        });

        let parsed: z.infer<typeof SinglePageOutput>;
        try { parsed = SinglePageOutput.parse(JSON.parse(llm.text)); }
        catch { skipped++; continue; }

        if (!parsed.is_program || !parsed.grant) { skipped++; continue; }
        const g = parsed.grant;
        const ck = canonicalKey(funder.id, g.title, g.amount_cad_min ?? null, g.amount_cad_max ?? null);

        const { data: existing } = await supabaseAdmin
          .from("grants")
          .select("id, times_seen")
          .eq("canonical_key", ck)
          .maybeSingle();
        if (existing) {
          await supabaseAdmin.from("grants").update({
            last_seen_at: new Date().toISOString(),
            times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
          } as never).eq("id", existing.id);
          seenAgain++;
          continue;
        }

        const sourceHash = createHash("sha256").update(`${g.url}|${g.title}`).digest("hex");
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
          url: g.url || url,
          source_hash: sourceHash,
          canonical_key: ck,
          status: "discovered",
        });
        if (!ierr) inserted++;
      }

      await supabaseAdmin
        .from("funders")
        .update({ last_discovered_at: new Date().toISOString() } as never)
        .eq("id", funder.id);

      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "discoverer", status: "succeeded",
        model: "google/gemini-2.5-flash",
        latency_ms: Date.now() - t0,
        metadata: {
          funder_id: funder.id, engine: "firecrawl_v2",
          urls_mapped: mapped.size, urls_scraped: candidates.length,
          urls_skipped: skipped, inserted, seen_again: seenAgain,
        },
      });
      return { ok: true, inserted, seenAgain, urlsMapped: mapped.size, urlsScraped: candidates.length, runId, engine: "firecrawl_v2" };
    }

    // ----- Path B: Fallback (no Firecrawl) → v1-style single index fetch -----
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
    } finally { clearTimeout(timer); }

    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000);

    if (text.length < 200) {
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "discoverer", status: "degraded",
        model: "google/gemini-2.5-flash", latency_ms: Date.now() - t0,
        error: "page_too_short",
        metadata: { funder_id: funder.id, engine: "fallback" },
      });
      return { ok: true, inserted: 0, runId, degraded: true, engine: "fallback" };
    }

    const llm = await callLlm({
      model: "google/gemini-2.5-flash",
      agent: "discoverer",
      runId, temperature: 0.1, responseFormat: "json",
      messages: [
        { role: "system", content: `${PROMPTS.discoverer.system}\nPrompt version: ${PROMPTS.discoverer.version}` },
        { role: "user", content:
          `Funder: ${funder.name}\nSource URL: ${funder.source_url}\n\nPage text:\n${text}\n\n` +
          `Return JSON: { "grants": [ { "title", "title_fr"?, "summary"?, "summary_fr"?, ` +
          `"amount_cad_min"?, "amount_cad_max"?, "deadline"?, "eligibility"?, "sectors"?, "language", "url" } ] }` },
      ],
    });

    const { DiscovererOutput } = await import("@/agents/schemas");
    let parsed: ReturnType<typeof DiscovererOutput.parse>;
    try { parsed = DiscovererOutput.parse(JSON.parse(llm.text)); }
    catch (e) {
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "discoverer", status: "failed",
        model: "google/gemini-2.5-flash", latency_ms: Date.now() - t0,
        error: `schema_validation: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { funder_id: funder.id, engine: "fallback" },
      });
      return { ok: false, inserted: 0, runId, error: "schema_validation", engine: "fallback" };
    }

    let inserted = 0;
    let seenAgain = 0;
    for (const g of parsed.grants) {
      const ck = canonicalKey(funder.id, g.title, g.amount_cad_min ?? null, g.amount_cad_max ?? null);
      const { data: existing } = await supabaseAdmin
        .from("grants").select("id, times_seen").eq("canonical_key", ck).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("grants").update({
          last_seen_at: new Date().toISOString(),
          times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
        } as never).eq("id", existing.id);
        seenAgain++; continue;
      }
      const sourceHash = createHash("sha256").update(`${g.url}|${g.title}`).digest("hex");
      const { error: ierr } = await supabaseAdmin.from("grants").insert({
        funder_id: funder.id, title: g.title, title_fr: g.title_fr ?? null,
        summary: g.summary ?? null, summary_fr: g.summary_fr ?? null,
        amount_cad_min: g.amount_cad_min ?? null, amount_cad_max: g.amount_cad_max ?? null,
        deadline: g.deadline ?? null,
        eligibility: (g.eligibility ?? {}) as Record<string, unknown> as never,
        sectors: g.sectors ?? [], language: g.language, url: g.url,
        source_hash: sourceHash, canonical_key: ck, status: "discovered",
      });
      if (!ierr) inserted++;
    }

    await supabaseAdmin
      .from("funders")
      .update({ last_discovered_at: new Date().toISOString() } as never)
      .eq("id", funder.id);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "discoverer", status: "succeeded",
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens, output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      metadata: { funder_id: funder.id, engine: "fallback", found: parsed.grants.length, inserted, seen_again: seenAgain },
    });
    return { ok: true, inserted, seenAgain, found: parsed.grants.length, runId, engine: "fallback" };
  });
