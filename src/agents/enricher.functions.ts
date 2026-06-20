import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EnricherOutput, PROMPTS } from "@/agents/schemas";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Enricher v4 — Evidence-First, Free-Tier.
//
// Pipeline:
//   1) Skip if already complete (no LLM, no scrape).
//   2) Scrape the grant page (Firecrawl → Jina → raw HTML).
//   3) Run deterministic extractors on the markdown (amounts, deadline,
//      eligibility, sectors). Each match writes an evidence_span with its
//      literal snippet + method + confidence.
//   4) If gaps remain, call a free LLM (Groq → Gemini → Cerebras cascade)
//      with the markdown as context and REQUIRE literal quote citations.
//   5) Reject any LLM-claimed value whose quote does not appear in the
//      scraped markdown (anti-hallucination).
//
// Server-only implementation. Exported so cron hooks (HMAC-signed) and the
// admin-gated `runEnricher` serverFn can both call it without exposing a
// public unauthenticated RPC endpoint.
export type EnricherResult = {
  ok: boolean;
  runId: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
  filled?: string[];
  deterministic_counts?: Record<string, number>;
  provider?: string;
};

export async function enrichGrantImpl(grantId: string): Promise<EnricherResult> {
    const data = { grantId };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newRunId } = await import("@/lib/otel");
    const { scrapeWithFallback } = await import("@/lib/web-fetch.server");
    const { extractAmounts } = await import("@/agents/extractors/amounts.server");
    const { extractDeadline } = await import("@/agents/extractors/deadlines.server");
    const { extractEligibility } = await import("@/agents/extractors/eligibility.server");
    const { extractSectors } = await import("@/agents/extractors/sectors.server");
    const { recordEvidence, snippetIsGrounded } = await import("@/agents/evidence.server");

    const runId = newRunId();
    const t0 = Date.now();

    const { data: g, error } = await supabaseAdmin
      .from("grants")
      .select("id, title, summary, language, url, status, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, enrich_attempts")
      .eq("id", data.grantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) throw new Error("grant_not_found");
    if (g.status !== "discovered") {
      return { ok: true, skipped: true, reason: `status=${g.status}`, runId };
    }
    if (((g as { enrich_attempts?: number }).enrich_attempts ?? 0) >= 3) {
      return { ok: true, skipped: true, reason: "max_attempts_reached", runId };
    }

    const hasAmount = g.amount_cad_min != null || g.amount_cad_max != null;
    const hasDeadline = !!g.deadline;
    const hasSectors = Array.isArray(g.sectors) && g.sectors.length > 0;
    const eligObj = (g.eligibility ?? {}) as Record<string, unknown>;
    const hasEligibility = Object.keys(eligObj).length > 0;

    if (hasAmount && hasDeadline && hasSectors && hasEligibility) {
      await supabaseAdmin.from("grants").update({
        status: "enriched", enriched_at: new Date().toISOString(),
      } as never).eq("id", g.id);
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "enricher", status: "succeeded",
        model: "noop", input_tokens: 0, output_tokens: 0,
        latency_ms: Date.now() - t0, grant_id: g.id,
        metadata: { mode: "already_complete" },
      });
      return { ok: true, runId, skipped: true, reason: "already_complete" };
    }

    // ----- Step 2: Scrape the page -----
    const scraped = await scrapeWithFallback(g.url);
    if (!scraped.ok) {
      const msg = `scrape_failed: ${scraped.error}`;
      await supabaseAdmin.from("grants").update({
        enrich_attempts: ((g as { enrich_attempts?: number }).enrich_attempts ?? 0) + 1,
        enrich_last_error: msg.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      } as never).eq("id", g.id);
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId, agent: "enricher", status: "failed",
        model: "scrape", latency_ms: Date.now() - t0, grant_id: g.id,
        error: msg, metadata: { via: scraped.via },
      });
      return { ok: false, runId, error: msg };
    }
    const markdown = scraped.markdown;
    const language = (g.language as "en" | "fr") ?? "en";

    // ----- Step 3: Deterministic extraction with evidence -----
    const patch: Record<string, unknown> = {};
    const methodCounts = { regex: 0, chrono: 0, rule: 0, llm: 0 };

    if (!hasAmount) {
      const am = extractAmounts(markdown);
      if (am) {
        if (am.min != null) patch.amount_cad_min = am.min;
        if (am.max != null) patch.amount_cad_max = am.max;
        methodCounts.regex++;
        if (am.max != null) {
          await recordEvidence({
            grantId: g.id, agent: "enricher", field: "amount_cad_max",
            value: am.max, sourceUrl: g.url, snippet: am.snippet,
            snippetOffset: am.matchOffset, method: "regex", runId,
          });
        }
        if (am.min != null) {
          await recordEvidence({
            grantId: g.id, agent: "enricher", field: "amount_cad_min",
            value: am.min, sourceUrl: g.url, snippet: am.snippet,
            snippetOffset: am.matchOffset, method: "regex", runId,
          });
        }
      }
    }

    if (!hasDeadline) {
      const dm = extractDeadline(markdown, language);
      if (dm) {
        patch.deadline = dm.iso;
        methodCounts.chrono++;
        await recordEvidence({
          grantId: g.id, agent: "enricher", field: "deadline",
          value: dm.iso, sourceUrl: g.url, snippet: dm.snippet,
          snippetOffset: dm.matchOffset, method: "chrono", runId,
        });
      }
    }

    if (!hasEligibility) {
      const em = extractEligibility(markdown);
      if (em.length > 0) {
        const elig: Record<string, true> = {};
        for (const e of em) {
          elig[e.tag] = true;
          methodCounts.rule++;
          await recordEvidence({
            grantId: g.id, agent: "enricher", field: `eligibility.${e.tag}`,
            value: true, sourceUrl: g.url, snippet: e.snippet,
            snippetOffset: e.matchOffset, method: "rule", runId,
          });
        }
        patch.eligibility = elig as never;
      }
    }

    if (!hasSectors) {
      const sm = extractSectors(markdown);
      if (sm.length > 0) {
        patch.sectors = sm.map((s) => s.sector);
        for (const s of sm) {
          methodCounts.rule++;
          await recordEvidence({
            grantId: g.id, agent: "enricher", field: `sectors.${s.sector}`,
            value: s.sector, sourceUrl: g.url, snippet: s.snippet,
            snippetOffset: s.matchOffset, method: "rule", runId,
          });
        }
      }
    }

    // ----- Step 4: LLM gap-fill (only if still missing fields) -----
    const stillMissing: string[] = [];
    if (!hasAmount && patch.amount_cad_max == null && patch.amount_cad_min == null)
      stillMissing.push("amount_cad_min", "amount_cad_max");
    if (!hasDeadline && patch.deadline == null) stillMissing.push("deadline");
    if (!hasEligibility && patch.eligibility == null) stillMissing.push("eligibility");
    if (!hasSectors && patch.sectors == null) stillMissing.push("sectors");

    let llmInfo: { provider: string; model: string; inputTokens?: number; outputTokens?: number } | null = null;

    if (stillMissing.length > 0) {
      const { callFreeLlm, freeProvidersAvailable } = await import("@/agents/llm-free.server");
      const hasFree = freeProvidersAvailable().length > 0;
      const { firecrawlAvailable, firecrawlScrape } = await import("@/lib/firecrawl.server");

      // Tier order:
      //   1) Free LLM cascade (Groq → Gemini → Cerebras) if any key set.
      //   2) Firecrawl JSON extraction — LLM runs server-side on their plan
      //      (no per-token cost beyond Firecrawl), uses FIRECRAWL_API_KEY only.
      //   3) Lovable AI Gateway — last-resort, costs project credits.
      // If none of the three are reachable, the enricher commits whatever the
      // deterministic extractors produced and records "needs_review" metadata.

      let llmResultText: string | null = null;
      let llmProvider = "none";
      let llmModel = "none";
      let llmInTok: number | undefined;
      let llmOutTok: number | undefined;

      // Tier 1 — free LLM cascade
      if (hasFree) {
        try {
          const llm = await callFreeLlm({
            agent: "enricher", runId, temperature: 0.1, responseFormat: "json",
            allowLovableFallback: false,
            messages: [
              { role: "system", content:
                `${PROMPTS.enricher.system}\nPrompt version: ${PROMPTS.enricher.version}\n` +
                `You MUST quote literal text from the source markdown to justify every field you fill. ` +
                `Return JSON: { "fields": { "<field>": { "value": ..., "quote": "literal text from markdown" } } }. ` +
                `If you cannot find justification in the markdown, omit the field. Never invent.` },
              { role: "user", content: JSON.stringify({
                needs: stillMissing, source_language: language,
                source_url: g.url, markdown: markdown.slice(0, 18_000),
              })},
            ],
          });
          llmResultText = llm.text; llmProvider = llm.provider; llmModel = llm.model;
          llmInTok = llm.inputTokens; llmOutTok = llm.outputTokens;
        } catch { /* fall through */ }
      }

      // Tier 2 — Firecrawl JSON extraction (zero extra LLM cost)
      if (!llmResultText && firecrawlAvailable()) {
        const props: Record<string, unknown> = {};
        const needSchema = (name: string, type: string) => ({
          type: "object",
          properties: {
            value: { type },
            quote: { type: "string", description: "Verbatim sentence from the page that justifies this value." },
          },
          required: ["value", "quote"],
        });
        if (stillMissing.includes("amount_cad_min")) props.amount_cad_min = needSchema("amount_cad_min", "number");
        if (stillMissing.includes("amount_cad_max")) props.amount_cad_max = needSchema("amount_cad_max", "number");
        if (stillMissing.includes("deadline")) props.deadline = needSchema("deadline", "string");
        if (stillMissing.includes("eligibility")) {
          props.eligibility = {
            type: "object",
            properties: { value: { type: "object" }, quote: { type: "string" } },
            required: ["value", "quote"],
          };
        }
        if (stillMissing.includes("sectors")) {
          props.sectors = {
            type: "object",
            properties: { value: { type: "array", items: { type: "string" } }, quote: { type: "string" } },
            required: ["value", "quote"],
          };
        }
        const fcSchema = { type: "object", properties: { fields: { type: "object", properties: props } } };
        const fc = await firecrawlScrape(g.url, {
          jsonSchema: fcSchema,
          jsonPrompt: "Extract the requested grant fields. For each field, copy a verbatim sentence from the page into `quote`. If the page does not state a field, omit it. Amounts must be in CAD as numbers. Deadlines must be ISO YYYY-MM-DD.",
        });
        if (fc.ok && fc.json) {
          llmResultText = JSON.stringify(fc.json);
          llmProvider = "firecrawl"; llmModel = "firecrawl-extract";
        }
      }

      // Tier 3 — Lovable AI (only if truly nothing else available)
      if (!llmResultText && !hasFree && !firecrawlAvailable()) {
        try {
          const llm = await callFreeLlm({
            agent: "enricher", runId, temperature: 0.1, responseFormat: "json",
            allowLovableFallback: true,
            messages: [
              { role: "system", content:
                `${PROMPTS.enricher.system}\nReturn JSON {"fields":{"<field>":{"value":...,"quote":"..."}}}. Quote literal page text. Never invent.` },
              { role: "user", content: JSON.stringify({
                needs: stillMissing, source_language: language,
                source_url: g.url, markdown: markdown.slice(0, 18_000),
              })},
            ],
          });
          llmResultText = llm.text; llmProvider = llm.provider; llmModel = llm.model;
          llmInTok = llm.inputTokens; llmOutTok = llm.outputTokens;
        } catch { /* fall through */ }
      }

      llmInfo = { provider: llmProvider, model: llmModel, inputTokens: llmInTok, outputTokens: llmOutTok };

      if (llmResultText) try {
        const llm = { text: llmResultText, model: llmModel };

        // Per-field validation. A bad quote on ONE field must not discard
        // the entire LLM response — accept the good fields and drop the rest.
        const FieldShape = z.object({
          value: z.unknown(),
          quote: z.string().min(4).max(1500),
        });
        const rawJson = JSON.parse(llm.text) as { fields?: Record<string, unknown> };
        const fieldsObj = rawJson.fields ?? {};
        for (const [field, raw] of Object.entries(fieldsObj)) {
          const parsedField = FieldShape.safeParse(raw);
          if (!parsedField.success) continue; // skip this field, keep going
          const payload = parsedField.data;
          if (!stillMissing.includes(field) && !field.startsWith("eligibility") && !field.startsWith("sectors")) continue;
          if (!snippetIsGrounded(payload.quote, markdown)) continue; // hallucination — drop
          // Coerce per-field
          if (field === "amount_cad_max" || field === "amount_cad_min") {
            const n = Number(payload.value);
            if (Number.isFinite(n) && n > 0) {
              (patch as Record<string, unknown>)[field] = n;
              await recordEvidence({
                grantId: g.id, agent: "enricher", field, value: n,
                sourceUrl: g.url, snippet: payload.quote,
                method: "llm", sourceMarkdown: markdown,
                model: llm.model, runId,
              });
            }
          } else if (field === "deadline") {
            const s = String(payload.value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
              patch.deadline = s;
              await recordEvidence({
                grantId: g.id, agent: "enricher", field: "deadline", value: s,
                sourceUrl: g.url, snippet: payload.quote, method: "llm",
                sourceMarkdown: markdown, model: llm.model, runId,
              });
            }
          } else if (field === "eligibility") {
            if (payload.value && typeof payload.value === "object") {
              patch.eligibility = payload.value as never;
              await recordEvidence({
                grantId: g.id, agent: "enricher", field: "eligibility", value: payload.value,
                sourceUrl: g.url, snippet: payload.quote, method: "llm",
                sourceMarkdown: markdown, model: llm.model, runId,
              });
            }
          } else if (field === "sectors") {
            if (Array.isArray(payload.value)) {
              patch.sectors = payload.value.map(String);
              await recordEvidence({
                grantId: g.id, agent: "enricher", field: "sectors", value: payload.value,
                sourceUrl: g.url, snippet: payload.quote, method: "llm",
                sourceMarkdown: markdown, model: llm.model, runId,
              });
            }
          }
        }
      } catch (e) {
        const msg = `llm_gap_fill_failed: ${e instanceof Error ? e.message : String(e)}`;
        // Non-fatal: deterministic results may already be in `patch`.
        await supabaseAdmin.from("agent_runs").insert({
          run_id: runId, agent: "enricher", status: "degraded",
          model: llmInfo?.model ?? "free-cascade",
          input_tokens: llmInfo?.inputTokens, output_tokens: llmInfo?.outputTokens,
          latency_ms: Date.now() - t0, grant_id: g.id,
          error: msg.slice(0, 500),
          metadata: { provider: llmInfo?.provider, missing: stillMissing, via: scraped.via },
        });
      }
    }

    // Schema check on the structural shape we built
    const built = EnricherOutput.partial().safeParse(patch);
    if (!built.success) {
      await supabaseAdmin.from("grants").update({
        enrich_attempts: ((g as { enrich_attempts?: number }).enrich_attempts ?? 0) + 1,
        enrich_last_error: `schema_validation: ${built.error.message}`.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      } as never).eq("id", g.id);
      return { ok: false, runId, error: "schema_validation" };
    }

    patch.status = "enriched";
    patch.enriched_at = new Date().toISOString();
    const { error: uerr } = await supabaseAdmin.from("grants").update(patch as never).eq("id", g.id);
    if (uerr) throw new Error(`grant_update_failed: ${uerr.message}`);

    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId, agent: "enricher", status: "succeeded",
      model: llmInfo?.model ?? "deterministic",
      input_tokens: llmInfo?.inputTokens ?? 0,
      output_tokens: llmInfo?.outputTokens ?? 0,
      latency_ms: Date.now() - t0, grant_id: g.id,
      metadata: {
        via: scraped.via,
        provider: llmInfo?.provider ?? "none",
        deterministic_counts: methodCounts,
        still_missing_after: stillMissing.filter((f) => (patch as Record<string, unknown>)[f] == null),
      },
    });
    return {
      ok: true, runId,
      filled: Object.keys(patch).filter((k) => k !== "status" && k !== "enriched_at"),
      deterministic_counts: methodCounts,
      provider: llmInfo?.provider ?? "none",
    };
}

// Thin admin-only serverFn wrapper. Public RPC endpoint is auth-gated:
// only signed-in admins can trigger ad-hoc enrichment, preventing anyone
// from burning LLM credits via the public URL.
export const runEnricher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    return enrichGrantImpl(data.grantId);
  });
