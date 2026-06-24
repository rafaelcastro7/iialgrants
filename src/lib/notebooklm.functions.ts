// NotebookLM briefing builder.
//
// NotebookLM has no public API. Best UX is to produce ONE high-quality,
// evidence-citing Markdown document the user drops into a notebook as a
// single source — plus a deep link that opens NotebookLM in a new tab.
//
// This module replaces the older copy/paste UUID workflow:
//   1. user picks a scope (selected ids / top-fit / shortlisted / all-enriched)
//   2. server builds the briefing, including verified evidence_spans
//   3. server (optionally) marks the included grants as shortlisted in one shot
//   4. client copies to clipboard, downloads .md, opens notebooklm.google.com
//
// Available to any authenticated user — curation is not an admin-only action.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScopeEnum = z.enum(["selected", "top-fit", "shortlisted", "all-enriched"]);

const ELIGIBLE_STATUSES = ["enriched", "scored", "shortlisted", "in_proposal"] as const;

export const buildNotebookBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      scope: ScopeEnum.default("top-fit"),
      ids: z.array(z.string().uuid()).max(50).optional(),
      maxItems: z.number().int().min(1).max(50).default(25),
      autoShortlist: z.boolean().default(true),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    type Row = {
      id: string;
      title: string;
      summary: string | null;
      amount_cad_min: number | null;
      amount_cad_max: number | null;
      deadline: string | null;
      sectors: string[] | null;
      eligibility: string | null;
      language: string;
      url: string;
      status: string;
      fit_score: number | null;
      funder:
        | { name: string; jurisdiction: string | null }
        | { name: string; jurisdiction: string | null }[]
        | null;
    };

    const selectCols =
      "id, title, summary, amount_cad_min, amount_cad_max, deadline, sectors, eligibility, language, url, status, fit_score, funder:funders(name, jurisdiction)";

    let q = supabase.from("grants").select(selectCols).limit(data.maxItems);

    if (data.scope === "selected") {
      if (!data.ids || data.ids.length === 0) {
        throw new Error("scope=selected requires at least one id");
      }
      q = q.in("id", data.ids);
    } else if (data.scope === "shortlisted") {
      q = q.eq("status", "shortlisted")
        .order("fit_score", { ascending: false, nullsFirst: false });
    } else if (data.scope === "all-enriched") {
      q = q.in("status", ELIGIBLE_STATUSES as unknown as string[])
        .order("discovered_at", { ascending: false });
    } else {
      // top-fit (default)
      q = q.in("status", ELIGIBLE_STATUSES as unknown as string[])
        .not("fit_score", "is", null)
        .order("fit_score", { ascending: false, nullsFirst: false });
    }

    const { data: rowsRaw, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (rowsRaw ?? []) as unknown as Row[];

    if (rows.length === 0) {
      return {
        ok: false as const,
        reason: "no_grants",
        message: "No grants match this scope yet. Discover or enrich some first.",
      };
    }

    const ids = rows.map((r) => r.id);

    // ── Per-user evaluation rationale (RLS-scoped, safe).
    const { data: evals } = await supabase
      .from("grant_evaluations")
      .select("grant_id, fit_score, eligibility_pass, rationale_en, criteria_json")
      .eq("user_id", userId)
      .in("grant_id", ids);
    const evalByGrant = new Map(
      (evals ?? []).map((e) => [
        e.grant_id,
        {
          fit_score: Number(e.fit_score),
          eligibility_pass: !!e.eligibility_pass,
          rationale: (e.rationale_en ?? "").trim(),
          criteria: (e.criteria_json ?? null) as unknown,
        },
      ]),
    );

    // ── Evidence spans (the citation backbone). RLS allows authenticated reads.
    const { data: spans } = await supabase
      .from("evidence_spans")
      .select("grant_id, agent, field, value, source_url, snippet, extraction_method, confidence")
      .in("grant_id", ids)
      .order("confidence", { ascending: false });
    const spansByGrant = new Map<string, NonNullable<typeof spans>>();
    for (const s of spans ?? []) {
      const list = spansByGrant.get(s.grant_id) ?? [];
      list.push(s);
      spansByGrant.set(s.grant_id, list);
    }

    // ── Build the briefing.
    const generatedAt = new Date().toISOString();
    const fmtCad = (n: number | null) =>
      n == null ? "—" : `CAD ${n.toLocaleString("en-CA")}`;

    const parts: string[] = [
      `# IIAL Grant Briefing — ${generatedAt.slice(0, 10)}`,
      ``,
      `_Generated: ${generatedAt}_  ·  _Scope: \`${data.scope}\`_  ·  _Grants: ${rows.length}_`,
      ``,
      `> **How to use in NotebookLM**`,
      `> 1. Open notebooklm.google.com and create a new notebook.`,
      `> 2. Add source → **Paste text** → paste this entire document (or upload the .md file).`,
      `> 3. Use the suggested questions at the bottom, or generate an Audio Overview.`,
      ``,
      `Each grant section ends with a **Sources** block citing verifiable snippets from the funder's own pages. Treat statements without a source as derived.`,
      ``,
      `---`,
      ``,
    ];

    let totalSpans = 0;
    let grantsWithEvidence = 0;

    for (const r of rows) {
      const funder = Array.isArray(r.funder) ? r.funder[0] : r.funder;
      const evalRow = evalByGrant.get(r.id);
      const evidence = spansByGrant.get(r.id) ?? [];
      if (evidence.length > 0) grantsWithEvidence++;
      totalSpans += evidence.length;

      parts.push(
        `## ${r.title}`,
        ``,
        `| Field | Value |`,
        `|---|---|`,
        `| Funder | ${funder?.name ?? "—"}${funder?.jurisdiction ? ` _(${funder.jurisdiction})_` : ""} |`,
        `| Amount | ${fmtCad(r.amount_cad_min)} – ${fmtCad(r.amount_cad_max)} |`,
        `| Deadline | ${r.deadline ?? "—"} |`,
        `| Sectors | ${(r.sectors ?? []).join(", ") || "—"} |`,
        `| Status | ${r.status} |`,
        `| Fit score | ${r.fit_score ?? evalRow?.fit_score ?? "—"} / 100 |`,
        `| Official URL | <${r.url}> |`,
        `| IIAL id | \`${r.id}\` |`,
        ``,
      );

      if (r.summary) {
        parts.push(`### Summary`, ``, r.summary.trim(), ``);
      }

      if (r.eligibility) {
        parts.push(`### Eligibility (as published)`, ``, r.eligibility.trim(), ``);
      }

      if (evalRow?.rationale) {
        parts.push(
          `### IIAL fit rationale`,
          ``,
          `**Score:** ${evalRow.fit_score} / 100  ·  **Eligibility:** ${evalRow.eligibility_pass ? "pass" : "fail"}`,
          ``,
          evalRow.rationale,
          ``,
        );
      }

      // Sources block — numbered citations from evidence_spans.
      if (evidence.length > 0) {
        parts.push(`### Sources (verifiable evidence)`, ``);
        evidence.slice(0, 12).forEach((s, idx) => {
          const conf = Math.round(Number(s.confidence ?? 0) * 100);
          const tag = `${s.agent}/${s.field} · ${s.extraction_method} · ${conf}%`;
          const snippet = (s.snippet ?? "").trim().replace(/\s+/g, " ").slice(0, 280);
          parts.push(
            `**[${idx + 1}]** _${tag}_`,
            `> ${snippet}`,
            `Source: <${s.source_url}>`,
            ``,
          );
        });
      } else {
        parts.push(
          `### Sources`,
          ``,
          `_No verified evidence spans yet — re-run the Enricher to populate citations._`,
          ``,
        );
      }

      // Suggested NotebookLM questions per grant (drive deep-dive).
      parts.push(
        `### Suggested questions for NotebookLM`,
        ``,
        `- What is the exact eligibility criterion for "${funder?.name ?? "this funder"}"?`,
        `- Does this program require partnership with a specific entity type?`,
        `- What is the cost-share / cash-match obligation?`,
        `- Are there mandatory components (letters of support, audited financials)?`,
        `- What is the realistic preparation timeline given the deadline?`,
        ``,
        `---`,
        ``,
      );
    }

    // Global appendix.
    parts.push(
      `## Cross-grant questions for NotebookLM`,
      ``,
      `- Which 3 grants offer the best risk-adjusted return for IIAL as **Lead**?`,
      `- Which grants are best for IIAL as **Partner** (lower lift, faster turnaround)?`,
      `- Group the grants by capability area (WCIS / micro-credentials / applied research / smart cities / climate / international dev).`,
      `- Flag any grant where eligibility is ambiguous and needs a phone call to the funder.`,
      `- Build a 90-day calendar showing prep windows and submission dates.`,
      ``,
      `## Briefing quality`,
      ``,
      `- Grants included: ${rows.length}`,
      `- Grants with verified citations: ${grantsWithEvidence}`,
      `- Total evidence spans: ${totalSpans}`,
      ``,
    );

    const markdown = parts.join("\n");

    // ── Optional auto-shortlist: bump status and log an event in one batch.
    let shortlistedCount = 0;
    if (data.autoShortlist) {
      const toBump = rows.filter((r) => r.status !== "shortlisted" && r.status !== "in_proposal");
      if (toBump.length > 0) {
        const ts = new Date().toISOString();
        for (const r of toBump) {
          const { error: uerr } = await supabase
            .from("grants")
            .update({ status: "shortlisted", updated_at: ts } as never)
            .eq("id", r.id);
          if (uerr) continue;
          shortlistedCount++;
          await supabase.from("grant_events").insert({
            grant_id: r.id,
            from_status: r.status as never,
            to_status: "shortlisted" as never,
            actor_user_id: userId,
            metadata: { source: "notebooklm_briefing", scope: data.scope } as never,
          });
        }
      }
    }

    return {
      ok: true as const,
      generatedAt,
      scope: data.scope,
      count: rows.length,
      grantsWithEvidence,
      totalSpans,
      shortlistedCount,
      markdown,
      ids,
    };
  });
