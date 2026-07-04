import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EnricherOutput, PROMPTS } from "@/agents/schemas";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_ENRICH_ATTEMPTS } from "@/agents/pipeline-stages.shared";

export type EnricherResult = {
  ok: boolean;
  runId: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
  filled?: string[];
  deterministic_counts?: Record<string, number>;
  provider?: string;
  attempts?: import("@/lib/web-fetch.server").FetchAttempt[];
};

type EnricherDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase query builder is intentional
  from: (table: string) => any;
};

export async function enrichGrantImpl(
  grantId: string,
  opts?: { db?: EnricherDb; userId?: string | null },
): Promise<EnricherResult> {
  const data = { grantId };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { newRunId } = await import("@/lib/otel");
  const { scrapeWithFallback } = await import("@/lib/web-fetch.server");
  const { extractAmounts } = await import("@/agents/extractors/amounts.server");
  const { extractDeadline } = await import("@/agents/extractors/deadlines.server");
  const { extractEligibility } = await import("@/agents/extractors/eligibility.server");
  const { extractSectors } = await import("@/agents/extractors/sectors.server");
  const { recordEvidence, snippetIsGrounded } = await import("@/agents/evidence.server");
  const { traceStep } = await import("@/agents/trace.server");
  const db = opts?.db ?? supabaseAdmin;
  const actorUserId = opts?.userId ?? null;

  const runId = newRunId();
  const t0 = Date.now();
  const trace = (
    step: string,
    message: string,
    status: "info" | "ok" | "warn" | "error" | "start" | "done" = "info",
    payload?: Record<string, unknown>,
  ) =>
    traceStep({
      runId,
      grantId: data.grantId,
      agent: "enricher",
      step,
      status,
      message,
      payload,
      db,
    });

  await trace("init", `Starting enrichment for grant ${data.grantId.slice(0, 8)}`, "start");

  const { data: g, error } = await db
    .from("grants")
    .select(
      "id, title, summary, language, url, status, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, enrich_attempts",
    )
    .eq("id", data.grantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!g) throw new Error("grant_not_found");
  if (g.status !== "discovered") {
    await trace("skip", `Skipped - status is "${g.status}", not "discovered"`, "warn");
    return { ok: true, skipped: true, reason: `status=${g.status}`, runId };
  }
  const currentAttempts = (g as { enrich_attempts?: number }).enrich_attempts ?? 0;
  if (currentAttempts >= MAX_ENRICH_ATTEMPTS) {
    await trace("skip", `Skipped - max ${MAX_ENRICH_ATTEMPTS} enrich attempts reached`, "warn");
    return { ok: true, skipped: true, reason: "max_attempts_reached", runId };
  }

  // Atomically claim this enrichment slot (optimistic lock). The extra .eq()
  // guards mean only ONE concurrent worker can advance enrich_attempts from
  // currentAttempts while the grant is still "discovered" — the loser matches
  // zero rows and skips. This also makes the attempt counter exact (the
  // increment happens once, here, instead of read-modify-write on each
  // failure path).
  const { data: claimed, error: claimErr } = await db
    .from("grants")
    .update({
      enrich_attempts: currentAttempts + 1,
      enrich_last_attempt_at: new Date().toISOString(),
    })
    .eq("id", g.id)
    .eq("status", "discovered")
    .eq("enrich_attempts", currentAttempts)
    .select("id");
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
    await trace("skip", "Skipped - another worker claimed this grant concurrently", "warn");
    return { ok: true, skipped: true, reason: "claimed_by_another_worker", runId };
  }

  const hasAmountMin = g.amount_cad_min != null;
  const hasAmountMax = g.amount_cad_max != null;
  const hasAmount = hasAmountMin || hasAmountMax;
  const hasDeadline = !!g.deadline;
  const hasSectors = Array.isArray(g.sectors) && g.sectors.length > 0;
  const eligObj = (g.eligibility ?? {}) as Record<string, unknown>;
  const hasEligibility = Object.keys(eligObj).length > 0;

  await trace(
    "inventory",
    `Existing fields: ${[hasAmount && "amount", hasDeadline && "deadline", hasSectors && "sectors", hasEligibility && "eligibility"].filter(Boolean).join(", ") || "(none)"}`,
    "info",
    { hasAmount, hasAmountMin, hasAmountMax, hasDeadline, hasSectors, hasEligibility },
  );

  if (hasAmount && hasDeadline && hasSectors && hasEligibility) {
    await trace("done", "Grant already complete - marking enriched without scraping", "done");
    await db
      .from("grants")
      .update({
        status: "enriched",
        enriched_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    await db.from("agent_runs").insert({
      run_id: runId,
      agent: "enricher",
      status: "succeeded",
      model: "noop",
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: Date.now() - t0,
      user_id: actorUserId,
      grant_id: g.id,
      metadata: { mode: "already_complete" },
    });
    return { ok: true, runId, skipped: true, reason: "already_complete" };
  }

  await trace("scrape", `Fetching ${g.url}`, "start");
  const tScrape = Date.now();
  const scraped = await scrapeWithFallback(g.url);
  const fetchAttempts = scraped.attempts ?? [];
  if (!scraped.ok) {
    const msg = `scrape_failed: ${scraped.error}`;
    await trace("scrape", msg, "error", {
      via: scraped.via,
      duration_ms: Date.now() - tScrape,
      attempts: fetchAttempts,
    });
    await db
      .from("grants")
      .update({
        enrich_last_error: msg.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    await db.from("agent_runs").insert({
      run_id: runId,
      agent: "enricher",
      status: "failed",
      model: "scrape",
      latency_ms: Date.now() - t0,
      user_id: actorUserId,
      grant_id: g.id,
      error: msg,
      metadata: { via: scraped.via, fetch_attempts: fetchAttempts },
    });
    return { ok: false, runId, error: msg, attempts: fetchAttempts };
  }

  const language = (g.language as "en" | "fr") ?? "en";
  const patch: Record<string, unknown> = {};
  const methodCounts = { regex: 0, chrono: 0, rule: 0, llm: 0 };
  const pages: Array<{ url: string; markdown: string }> = [
    { url: g.url, markdown: scraped.markdown },
  ];
  const missingFields = () => {
    const missing: string[] = [];
    if (!hasAmountMin && patch.amount_cad_min == null) missing.push("amount_cad_min");
    if (!hasAmountMax && patch.amount_cad_max == null) missing.push("amount_cad_max");
    if (!hasDeadline && patch.deadline == null) missing.push("deadline");
    if (!hasEligibility && patch.eligibility == null) missing.push("eligibility");
    if (!hasSectors && patch.sectors == null) missing.push("sectors");
    return missing;
  };
  const pageForQuote = (quote: string) =>
    pages.find((page) => snippetIsGrounded(quote, page.markdown)) ?? null;
  const grantTitleTokens: string[] = Array.from(
    new Set<string>(
      g.title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(
          (token: string) =>
            token.length >= 4 &&
            ![
              "grant",
              "grants",
              "fund",
              "funding",
              "program",
              "programme",
              "award",
              "awards",
              "support",
            ].includes(token),
        ),
    ),
  );
  const pageLooksRelevantToGrant = (page: { url: string; markdown: string }) => {
    if (grantTitleTokens.length === 0) return true;
    const hay = `${page.url}\n${page.markdown.slice(0, 2_500)}`
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const overlap = grantTitleTokens.filter((token: string) => hay.includes(token)).length;
    return overlap >= Math.min(2, grantTitleTokens.length);
  };

  await trace("scrape", `Scraped ${scraped.markdown.length} chars via ${scraped.via}`, "done", {
    via: scraped.via,
    chars: scraped.markdown.length,
    duration_ms: Date.now() - tScrape,
    attempts: fetchAttempts,
  });

  await trace("extractors", "Running deterministic extractors (regex / chrono / rules)", "start");

  const runExtractorsOnPage = async (
    page: { url: string; markdown: string },
    stage: "main" | "deep",
  ) => {
    const needAmountMin = !hasAmountMin && patch.amount_cad_min == null;
    const needAmountMax = !hasAmountMax && patch.amount_cad_max == null;
    if (needAmountMin || needAmountMax) {
      const amountMatch = extractAmounts(page.markdown);
      if (amountMatch) {
        let foundAmount = false;
        if (needAmountMin && amountMatch.min != null) {
          patch.amount_cad_min = amountMatch.min;
          foundAmount = true;
          await recordEvidence({
            grantId: g.id,
            agent: "enricher",
            field: "amount_cad_min",
            value: amountMatch.min,
            sourceUrl: page.url,
            snippet: amountMatch.snippet,
            snippetOffset: amountMatch.matchOffset,
            method: "regex",
            runId,
            db,
          });
        }
        if (needAmountMax && amountMatch.max != null) {
          patch.amount_cad_max = amountMatch.max;
          foundAmount = true;
          await recordEvidence({
            grantId: g.id,
            agent: "enricher",
            field: "amount_cad_max",
            value: amountMatch.max,
            sourceUrl: page.url,
            snippet: amountMatch.snippet,
            snippetOffset: amountMatch.matchOffset,
            method: "regex",
            runId,
            db,
          });
        }
        if (foundAmount) {
          methodCounts.regex++;
          await trace(
            "regex_amount",
            `Found amount on ${stage} page: $${amountMatch.min ?? "?"} - $${amountMatch.max ?? "?"}`,
            "ok",
            {
              page: page.url,
              snippet: amountMatch.snippet.slice(0, 200),
            },
          );
        } else if (stage === "main") {
          await trace("regex_amount", "No usable amount detected by regex", "info");
        }
      } else if (stage === "main") {
        await trace("regex_amount", "No amount detected by regex", "info");
      }
    }

    if (!hasDeadline && patch.deadline == null) {
      const deadlineMatch = extractDeadline(page.markdown, language);
      // extractDeadline returns the sentinel iso:"Rolling" for continuous-
      // intake language — NOT a real ISO date. `deadline` is a typed date
      // column/Zod field (/^\d{4}-\d{2}-\d{2}$/), so writing "Rolling" into it
      // used to fail EnricherOutput.partial().safeParse() for the ENTIRE
      // patch (amount, eligibility, sectors included), not just this field —
      // after 3 such failures the grant was permanently stuck in "discovered"
      // with everything else it had already correctly extracted discarded.
      // The evaluator's isRollingIntake() independently re-detects rolling
      // intake from the grant's stored text, so leaving deadline unset here
      // loses nothing.
      if (deadlineMatch && deadlineMatch.iso === "Rolling") {
        await trace(
          "chrono_deadline",
          `Rolling/continuous intake detected on ${stage} page (leaving deadline unset)`,
          "info",
          { page: page.url, snippet: deadlineMatch.snippet.slice(0, 200) },
        );
      } else if (deadlineMatch) {
        patch.deadline = deadlineMatch.iso;
        methodCounts.chrono++;
        await trace(
          "chrono_deadline",
          `Found deadline on ${stage} page: ${deadlineMatch.iso}`,
          "ok",
          {
            page: page.url,
            snippet: deadlineMatch.snippet.slice(0, 200),
          },
        );
        await recordEvidence({
          grantId: g.id,
          agent: "enricher",
          field: "deadline",
          value: deadlineMatch.iso,
          sourceUrl: page.url,
          snippet: deadlineMatch.snippet,
          snippetOffset: deadlineMatch.matchOffset,
          method: "chrono",
          runId,
          db,
        });
      } else if (stage === "main") {
        await trace("chrono_deadline", "No deadline detected", "info");
      }
    }

    if (!hasEligibility && patch.eligibility == null) {
      const eligibilityMatches = extractEligibility(page.markdown);
      if (eligibilityMatches.length > 0) {
        const eligibility: Record<string, true> = {};
        for (const match of eligibilityMatches) {
          eligibility[match.tag] = true;
          methodCounts.rule++;
          await recordEvidence({
            grantId: g.id,
            agent: "enricher",
            field: `eligibility.${match.tag}`,
            value: true,
            sourceUrl: page.url,
            snippet: match.snippet,
            snippetOffset: match.matchOffset,
            method: "rule",
            runId,
            db,
          });
        }
        patch.eligibility = eligibility as never;
        await trace(
          "rule_eligibility",
          `Matched eligibility tags on ${stage} page: ${eligibilityMatches.map((match) => match.tag).join(", ")}`,
          "ok",
          { page: page.url, tags: eligibilityMatches.map((match) => match.tag) },
        );
      } else if (stage === "main") {
        await trace("rule_eligibility", "No eligibility tags matched", "info");
      }
    }

    if (!hasSectors && patch.sectors == null) {
      const sectorMatches = extractSectors(page.markdown);
      if (sectorMatches.length > 0) {
        patch.sectors = sectorMatches.map((match) => match.sector);
        for (const match of sectorMatches) {
          methodCounts.rule++;
          await recordEvidence({
            grantId: g.id,
            agent: "enricher",
            field: `sectors.${match.sector}`,
            value: match.sector,
            sourceUrl: page.url,
            snippet: match.snippet,
            snippetOffset: match.matchOffset,
            method: "rule",
            runId,
            db,
          });
        }
        await trace(
          "rule_sectors",
          `Detected sectors on ${stage} page: ${sectorMatches.map((match) => match.sector).join(", ")}`,
          "ok",
          { page: page.url, sectors: sectorMatches.map((match) => match.sector) },
        );
      } else if (stage === "main") {
        await trace("rule_sectors", "No sectors detected", "info");
      }
    }
  };

  await runExtractorsOnPage(pages[0], "main");

  const missingAfterMain = missingFields();
  if (missingAfterMain.length > 0) {
    const { gatherDeepMarkdown } = await import("@/lib/deep-crawl.server");
    await trace(
      "deep_crawl",
      `Partial data after main page. Following official detail pages for: ${missingAfterMain.join(", ")}`,
      "start",
      { missing: missingAfterMain },
    );
    const deepPages = await gatherDeepMarkdown(g.url, scraped.markdown, { max: 3, title: g.title });
    if (deepPages.length > 0) {
      pages.push(...deepPages);
      await trace("deep_crawl", `Fetched ${deepPages.length} official detail page(s)`, "done", {
        pages: deepPages.map((page) => page.url),
      });
      for (const page of deepPages) {
        if (missingFields().length === 0) break;
        if (!pageLooksRelevantToGrant(page)) {
          await trace("deep_crawl_filter", "Skipped low-relevance detail page", "warn", {
            page: page.url,
            grant_title: g.title,
          });
          continue;
        }
        await runExtractorsOnPage(page, "deep");
      }
    } else {
      await trace("deep_crawl", "No additional official detail pages found", "warn");
    }
  }

  await trace(
    "extractors",
    `Deterministic done - regex:${methodCounts.regex} chrono:${methodCounts.chrono} rule:${methodCounts.rule}`,
    "done",
    {
      ...methodCounts,
      pages_consulted: pages.map((page) => page.url),
    },
  );

  const stillMissing = missingFields();

  // Security: sanitize markdown + enforce size limit
  const { sanitizeMarkdown, validateTotalMarkdownSize } =
    await import("@/lib/prompt-safety.server");
  const sanitizedPages = pages.map((p) => ({ ...p, markdown: sanitizeMarkdown(p.markdown) }));
  const combinedMarkdown = sanitizedPages
    .map((page, index) => `Source ${index + 1}: ${page.url}\n${page.markdown.slice(0, 6000)}`)
    .join("\n\n");

  const sizeCheck = validateTotalMarkdownSize(combinedMarkdown.length);
  if (!sizeCheck.valid) {
    const msg = `markdown_overflow: ${sizeCheck.error}`;
    await trace("security", msg, "warn");
    // Persist the diagnosis like every other failure path — the attempt was
    // already consumed by the atomic claim, so leave a visible reason behind.
    await db
      .from("grants")
      .update({
        enrich_last_error: msg.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    await db.from("agent_runs").insert({
      run_id: runId,
      agent: "enricher",
      status: "failed",
      model: "security-gate",
      latency_ms: Date.now() - t0,
      user_id: actorUserId,
      grant_id: g.id,
      error: msg.slice(0, 500),
      metadata: { via: scraped.via, pages_consulted: pages.map((p) => p.url) },
    });
    return { ok: false, runId, error: sizeCheck.error, attempts: fetchAttempts };
  }

  let llmInfo: {
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
  } | null = null;

  if (stillMissing.length > 0) {
    await trace(
      "llm_gap",
      `Missing fields after extractors: ${stillMissing.join(", ")} - invoking LLM cascade`,
      "start",
      { missing: stillMissing },
    );
    const { callFreeLlm, freeProvidersAvailable } = await import("@/agents/llm-free.server");
    const available = freeProvidersAvailable();
    const hasFree = available.length > 0;
    const { firecrawlAvailable, firecrawlScrape } = await import("@/lib/firecrawl.server");
    await trace(
      "llm_providers",
      `Free providers available: ${available.join(", ") || "(none)"} | firecrawl=${firecrawlAvailable()}`,
      "info",
      {
        providers: available,
        firecrawl: firecrawlAvailable(),
      },
    );

    let llmResultText: string | null = null;
    let llmProvider = "none";
    let llmModel = "none";
    let llmInTok: number | undefined;
    let llmOutTok: number | undefined;

    if (hasFree) {
      const tLlm = Date.now();
      await trace("llm_cascade", "Calling free LLM cascade (Groq -> Gemini -> Cerebras)", "start");
      try {
        const llm = await callFreeLlm({
          agent: "enricher",
          runId,
          temperature: 0.1,
          responseFormat: "json",
          allowLovableFallback: false,
          messages: [
            {
              role: "system",
              content:
                `${PROMPTS.enricher.system}\nPrompt version: ${PROMPTS.enricher.version}\n` +
                `You MUST quote literal text from the provided source pages to justify every field you fill. ` +
                `Return JSON: { "fields": { "<field>": { "value": ..., "quote": "literal text from source pages" } } }. ` +
                `If you cannot find justification in the source pages, omit the field. Never invent.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                needs: stillMissing,
                source_language: language,
                source_url: g.url,
                source_pages: pages.map((page) => ({
                  url: page.url,
                  markdown: page.markdown.slice(0, 6000),
                })),
                combined_markdown: combinedMarkdown,
              }),
            },
          ],
        });
        llmResultText = llm.text;
        llmProvider = llm.provider;
        llmModel = llm.model;
        llmInTok = llm.inputTokens;
        llmOutTok = llm.outputTokens;
        await trace(
          "llm_cascade",
          `LLM responded via ${llm.provider}/${llm.model} (${llm.outputTokens ?? "?"} tokens, ${Date.now() - tLlm}ms)`,
          "done",
          {
            provider: llm.provider,
            model: llm.model,
            in: llm.inputTokens,
            out: llm.outputTokens,
          },
        );
      } catch (e) {
        await trace(
          "llm_cascade",
          `All free providers failed - ${e instanceof Error ? e.message : String(e)}`,
          "warn",
        );
      }
    }

    if (!llmResultText && firecrawlAvailable()) {
      const props: Record<string, unknown> = {};
      const needSchema = (type: string) => ({
        type: "object",
        properties: {
          value: { type },
          quote: {
            type: "string",
            description: "Verbatim sentence from the page that justifies this value.",
          },
        },
        required: ["value", "quote"],
      });
      if (stillMissing.includes("amount_cad_min")) props.amount_cad_min = needSchema("number");
      if (stillMissing.includes("amount_cad_max")) props.amount_cad_max = needSchema("number");
      if (stillMissing.includes("deadline")) props.deadline = needSchema("string");
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
          properties: {
            value: { type: "array", items: { type: "string" } },
            quote: { type: "string" },
          },
          required: ["value", "quote"],
        };
      }
      const fcSchema = {
        type: "object",
        properties: { fields: { type: "object", properties: props } },
      };
      const fc = await firecrawlScrape(g.url, {
        jsonSchema: fcSchema,
        jsonPrompt:
          "Extract the requested grant fields. For each field, copy a verbatim sentence from the page into quote. If the page does not state a field, omit it. Amounts must be CAD numbers. Deadlines must be ISO YYYY-MM-DD.",
      });
      if (fc.ok && fc.json) {
        llmResultText = JSON.stringify(fc.json);
        llmProvider = "firecrawl";
        llmModel = "firecrawl-extract";
      }
    }

    if (!llmResultText && !hasFree && !firecrawlAvailable()) {
      try {
        const llm = await callFreeLlm({
          agent: "enricher",
          runId,
          temperature: 0.1,
          responseFormat: "json",
          allowLovableFallback: true,
          messages: [
            {
              role: "system",
              content: `${PROMPTS.enricher.system}\nReturn JSON {"fields":{"<field>":{"value":...,"quote":"..."}}}. Quote literal page text. Never invent.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                needs: stillMissing,
                source_language: language,
                source_url: g.url,
                source_pages: pages.map((page) => ({
                  url: page.url,
                  markdown: page.markdown.slice(0, 6000),
                })),
                combined_markdown: combinedMarkdown,
              }),
            },
          ],
        });
        llmResultText = llm.text;
        llmProvider = llm.provider;
        llmModel = llm.model;
        llmInTok = llm.inputTokens;
        llmOutTok = llm.outputTokens;
      } catch {
        // fall through
      }
    }

    llmInfo = {
      provider: llmProvider,
      model: llmModel,
      inputTokens: llmInTok,
      outputTokens: llmOutTok,
    };

    if (llmResultText) {
      try {
        await trace(
          "llm_validate",
          "Validating LLM output: per-field schema + grounded-quote check",
          "start",
        );

        const rawJson = JSON.parse(llmResultText) as { fields?: Record<string, unknown> };
        const { evaluateLlmFields } = await import("@/agents/enricher-steps.server");
        // Pure decision step (unit-tested in enricher-steps.test.ts); the IO
        // below just applies accepted decisions and records their evidence.
        const { accepted, rejected } = evaluateLlmFields({
          fieldsObj: rawJson.fields ?? {},
          stillMissing,
          pageForQuote,
        });
        for (const d of accepted) {
          patch[d.field] = d.value as never;
          methodCounts.llm++;
          await recordEvidence({
            grantId: g.id,
            agent: "enricher",
            field: d.field,
            value: d.value,
            sourceUrl: d.page.url,
            snippet: d.quote,
            method: "llm",
            sourceMarkdown: d.page.markdown,
            model: llmModel,
            runId,
            db,
          });
        }
        await trace(
          "llm_validate",
          `Accepted: ${accepted.map((d) => d.field).join(", ") || "(none)"} | Rejected: ${rejected.join(", ") || "(none)"}`,
          accepted.length ? "done" : "warn",
          { accepted: accepted.map((d) => d.field), rejected },
        );
      } catch (e) {
        const msg = `llm_gap_fill_failed: ${e instanceof Error ? e.message : String(e)}`;
        await trace("llm_validate", msg, "error");
        await db.from("agent_runs").insert({
          run_id: runId,
          agent: "enricher",
          status: "degraded",
          model: llmInfo?.model ?? "free-cascade",
          input_tokens: llmInfo?.inputTokens,
          output_tokens: llmInfo?.outputTokens,
          latency_ms: Date.now() - t0,
          user_id: actorUserId,
          grant_id: g.id,
          error: msg.slice(0, 500),
          metadata: {
            provider: llmInfo?.provider,
            missing: stillMissing,
            via: scraped.via,
            pages_consulted: pages.map((page) => page.url),
          },
        });
      }
    }
  }

  try {
    const { translateStringsToEnglish, looksFrench } = await import("@/agents/translate.server");
    if (Array.isArray(patch.sectors)) {
      const arr = (patch.sectors as unknown[]).map(String);
      if (arr.some(looksFrench)) {
        patch.sectors = await translateStringsToEnglish({ strings: arr, agent: "enricher", runId });
        await trace("translate_sectors", "Translated French sector labels to English", "ok");
      }
    }
    if (patch.eligibility && typeof patch.eligibility === "object") {
      const eligibility = patch.eligibility as Record<string, unknown>;
      const stringEntries = Object.entries(eligibility).filter(
        ([, value]) => typeof value === "string",
      ) as Array<[string, string]>;
      const frEntries = stringEntries.filter(([, value]) => looksFrench(value));
      if (frEntries.length) {
        const translated = await translateStringsToEnglish({
          strings: frEntries.map(([, value]) => value),
          agent: "enricher",
          runId,
        });
        frEntries.forEach(([key], index) => {
          eligibility[key] = translated[index];
        });
        patch.eligibility = eligibility as never;
        await trace(
          "translate_eligibility",
          `Translated ${frEntries.length} French eligibility value(s)`,
          "ok",
        );
      }
    }
  } catch (e) {
    await trace(
      "translate",
      `Translation pass failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
      "warn",
    );
  }

  const built = EnricherOutput.partial().safeParse(patch);
  if (!built.success) {
    await trace("schema", `Schema validation failed: ${built.error.message}`, "error");
    await db
      .from("grants")
      .update({
        enrich_last_error: `schema_validation: ${built.error.message}`.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    return { ok: false, runId, error: "schema_validation" };
  }

  // Additional validation: min/max invariant
  const parsedPatch = built.data;
  if (
    parsedPatch.amount_cad_min != null &&
    parsedPatch.amount_cad_max != null &&
    parsedPatch.amount_cad_min > parsedPatch.amount_cad_max
  ) {
    await trace("schema", "amount_cad_min > amount_cad_max (halting enrichment)", "error");
    await db
      .from("grants")
      .update({
        enrich_last_error: "schema_validation: amount_cad_min must be <= amount_cad_max",
        enrich_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    return { ok: false, runId, error: "schema_validation" };
  }

  const extractedKeys = Object.keys(patch);
  const llmCascadeFailed = stillMissing.length > 0 && llmInfo?.provider === "none";
  // Critical fields for downstream evaluation. If the LLM returned but extracted
  // zero critical fields, treat as failure — the grant stays in "discovered" for
  // retry rather than being marked "enriched" with only cosmetic data.
  const criticalFields = ["amount_cad_min", "amount_cad_max", "deadline", "eligibility"];
  const extractedCritical = extractedKeys.filter((k) => criticalFields.includes(k));
  const hasCriticalMissing =
    stillMissing.some((f) => criticalFields.includes(f)) && extractedCritical.length === 0;
  if (extractedKeys.length === 0 || hasCriticalMissing) {
    const reason = llmCascadeFailed
      ? "no_extraction: deterministic=0 llm_cascade=all_providers_failed"
      : hasCriticalMissing
        ? `enrichment_insufficient: extracted [${extractedKeys.join(", ") || "none"}] but critical fields missing: ${stillMissing.filter((f) => criticalFields.includes(f)).join(", ")}`
        : "no_extraction: deterministic=0 llm_rejected_all_fields";
    await trace("commit", reason, "error", { still_missing: stillMissing });
    await db
      .from("grants")
      .update({
        enrich_last_error: reason.slice(0, 500),
        enrich_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    await db.from("agent_runs").insert({
      run_id: runId,
      agent: "enricher",
      status: "failed",
      model: "free-cascade",
      latency_ms: Date.now() - t0,
      user_id: actorUserId,
      grant_id: g.id,
      error: reason,
      metadata: {
        via: scraped.via,
        provider: "none",
        deterministic_counts: methodCounts,
        still_missing: stillMissing,
        fetch_attempts: fetchAttempts,
        scraped_bytes: scraped.markdown.length,
        pages_consulted: pages.map((page) => page.url),
      },
    });
    return {
      ok: false,
      runId,
      error: reason,
      deterministic_counts: methodCounts,
      provider: "none",
      attempts: fetchAttempts,
    };
  }

  // RFP-style requirements (documents to submit, process constraints) —
  // deterministic pattern extraction over everything we scraped, persisted so
  // the detail page can show what to prepare BEFORE drafting. Non-fatal.
  try {
    const { analyzeGrantRequirements } =
      await import("@/agents/grant-requirements-analyzer.server");
    const reqs = analyzeGrantRequirements(combinedMarkdown);
    if (reqs.requirements.length > 0) {
      patch.requirements = reqs.requirements;
      await trace("requirements", reqs.summary, "ok", {
        count: reqs.requirements.length,
        critical: reqs.requirements.filter((r) => r.isCritical).length,
      });
    }
  } catch (e) {
    await trace(
      "requirements",
      `Requirements analysis failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
      "warn",
    );
  }

  patch.status = "enriched";
  patch.enriched_at = new Date().toISOString();
  patch.enrich_last_error = null;
  patch.enrich_last_attempt_at = new Date().toISOString();
  const { error: updateError } = await db
    .from("grants")
    .update(patch as never)
    .eq("id", g.id);
  if (updateError) throw new Error(`grant_update_failed: ${updateError.message}`);

  const filled = Object.keys(patch).filter((key) => key !== "status" && key !== "enriched_at");
  await trace(
    "commit",
    `Grant marked enriched - fields filled: ${filled.join(", ") || "(none)"} | total ${Date.now() - t0}ms`,
    "done",
    {
      filled,
      total_ms: Date.now() - t0,
    },
  );

  await db.from("agent_runs").insert({
    run_id: runId,
    agent: "enricher",
    status: "succeeded",
    model: llmInfo?.model ?? "deterministic",
    input_tokens: llmInfo?.inputTokens ?? 0,
    output_tokens: llmInfo?.outputTokens ?? 0,
    latency_ms: Date.now() - t0,
    user_id: actorUserId,
    grant_id: g.id,
    metadata: {
      via: scraped.via,
      provider: llmInfo?.provider ?? "none",
      deterministic_counts: methodCounts,
      still_missing_after: missingFields(),
      fetch_attempts: fetchAttempts,
      pages_consulted: pages.map((page) => page.url),
    },
  });
  return {
    ok: true,
    runId,
    filled,
    deterministic_counts: methodCounts,
    provider: llmInfo?.provider ?? "none",
    attempts: fetchAttempts,
  };
}

export const runEnricher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin-guard");
    await assertAdmin(context.userId, context.supabase as never);
    return enrichGrantImpl(data.grantId, {
      db: context.supabase as never,
      userId: context.userId,
    });
  });
