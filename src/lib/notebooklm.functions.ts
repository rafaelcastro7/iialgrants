// NotebookLM briefing builder.
//
// NotebookLM has no public API. The most "automated" UX is therefore to ship
// ONE high-fidelity, evidence-citing Markdown document that NotebookLM can
// ingest as a single source — plus a deep link to open NotebookLM.
//
// This builder packs as much verifiable context as possible per grant:
//   • Funder metadata + website + jurisdiction
//   • All grant fields (amounts, deadlines, sectors, eligibility JSON)
//   • Per-user evaluation (fit score, eligibility, rationale)
//   • ALL evidence spans grouped by field (the citation backbone)
//   • Workflow timeline from grant_events
//   • Suggested questions tuned to NotebookLM's strengths
//
// Scopes: single | selected | top-fit | shortlisted | all-enriched.
// Optionally marks the included grants as Shortlisted in one batch.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScopeEnum = z.enum(["single", "selected", "top-fit", "shortlisted", "all-enriched"]);

type GrantStatus =
  | "discovered"
  | "enriched"
  | "scored"
  | "shortlisted"
  | "in_proposal"
  | "submitted"
  | "won"
  | "lost"
  | "expired"
  | "archived";
const ELIGIBLE_STATUSES: GrantStatus[] = ["enriched", "scored", "shortlisted", "in_proposal"];

const MAX_SPANS_PER_GRANT = 25;
const MAX_EVENTS_PER_GRANT = 12;

export const buildNotebookBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        scope: ScopeEnum.default("top-fit"),
        ids: z.array(z.string().uuid()).max(50).optional(),
        maxItems: z.number().int().min(1).max(50).default(25),
        autoShortlist: z.boolean().default(true),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    return buildNotebookBriefingImpl({ data, supabase: context.supabase, userId: context.userId });
  });

// Server-only impl. Exposed for E2E tests so the briefing can be exercised
// end-to-end without the auth middleware. Public callers go through the
// serverFn above; tests pass a mocked supabase client + userId.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildNotebookBriefingImpl(opts: {
  data: {
    scope: "single" | "selected" | "top-fit" | "shortlisted" | "all-enriched";
    ids?: string[];
    maxItems: number;
    autoShortlist: boolean;
  };
  supabase: any;
  userId: string;
}) {
  const { data, supabase, userId } = opts;
  try {
    type Row = {
      id: string;
      title: string;
      summary: string | null;
      amount_cad_min: number | null;
      amount_cad_max: number | null;
      currency: string;
      deadline: string | null;
      sectors: string[] | null;
      eligibility: unknown;
      language: string;
      url: string;
      status: string;
      fit_score: number | null;
      discovered_at: string;
      enriched_at: string | null;
      scored_at: string | null;
      funder:
        | {
            name: string;
            jurisdiction: string | null;
            website: string | null;
            source_url: string | null;
          }
        | {
            name: string;
            jurisdiction: string | null;
            website: string | null;
            source_url: string | null;
          }[]
        | null;
    };

    const selectCols =
      "id, title, summary, amount_cad_min, amount_cad_max, currency, deadline, sectors, eligibility, language, url, status, fit_score, discovered_at, enriched_at, scored_at, funder:funders(name, jurisdiction, website, source_url)";

    let q = supabase.from("grants").select(selectCols).limit(data.maxItems);

    if (data.scope === "single") {
      const id = data.ids?.[0];
      if (!id) throw new Error("scope=single requires one id");
      q = q.eq("id", id);
    } else if (data.scope === "selected") {
      if (!data.ids || data.ids.length === 0) {
        throw new Error("scope=selected requires at least one id");
      }
      q = q.in("id", data.ids);
    } else if (data.scope === "shortlisted") {
      q = q.eq("status", "shortlisted").order("fit_score", { ascending: false, nullsFirst: false });
    } else if (data.scope === "all-enriched") {
      q = q.in("status", ELIGIBLE_STATUSES).order("discovered_at", { ascending: false });
    } else {
      // top-fit (default)
      q = q
        .in("status", ELIGIBLE_STATUSES)
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
      .select("grant_id, fit_score, eligibility_pass, rationale_en, created_at")
      .eq("user_id", userId)
      .in("grant_id", ids)
      .order("created_at", { ascending: false });
    const evalByGrant = new Map<
      string,
      { fit_score: number; eligibility_pass: boolean; rationale: string }
    >();
    for (const e of evals ?? []) {
      if (evalByGrant.has(e.grant_id)) continue; // keep latest only
      evalByGrant.set(e.grant_id, {
        fit_score: Number(e.fit_score),
        eligibility_pass: !!e.eligibility_pass,
        rationale: (e.rationale_en ?? "").trim(),
      });
    }

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

    // ── Workflow timeline.
    const { data: events } = await supabase
      .from("grant_events")
      .select("grant_id, from_status, to_status, actor_agent, reason, created_at")
      .in("grant_id", ids)
      .order("created_at", { ascending: true });
    const eventsByGrant = new Map<string, NonNullable<typeof events>>();
    for (const e of events ?? []) {
      const list = eventsByGrant.get(e.grant_id) ?? [];
      list.push(e);
      eventsByGrant.set(e.grant_id, list);
    }

    // ── Build the briefing.
    const generatedAt = new Date().toISOString();
    const fmtMoney = (n: number | null, ccy: string) =>
      n == null ? "—" : `${ccy} ${n.toLocaleString("en-CA")}`;

    const formatEligibility = (e: unknown): string | null => {
      if (e == null) return null;
      if (typeof e === "string") return e.trim() || null;
      if (Array.isArray(e)) {
        const items = e.filter(Boolean).map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
        return items.length ? items.map((s) => `- ${s}`).join("\n") : null;
      }
      if (typeof e === "object") {
        const entries = Object.entries(e as Record<string, unknown>).filter(
          ([, v]) => v != null && v !== "",
        );
        if (!entries.length) return null;
        return entries
          .map(([k, v]) => `- **${k}**: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n");
      }
      return String(e);
    };

    const singleScope = data.scope === "single";
    const parts: string[] = [
      `# ${singleScope ? `IIAL Grant Deep-Dive — ${rows[0].title}` : `IIAL Grant Briefing — ${generatedAt.slice(0, 10)}`}`,
      ``,
      `_Generated: ${generatedAt}_  ·  _Scope: \`${data.scope}\`_  ·  _Grants: ${rows.length}_`,
      ``,
      `> **How to use in NotebookLM**`,
      `> 1. Open notebooklm.google.com and create (or open) a notebook.`,
      `> 2. Add source → **Paste text** → paste this entire document (or upload the .md file).`,
      `> 3. Ask the questions at the bottom, or generate an Audio Overview.`,
      ``,
      `Every grant section ends with a **Sources** block citing verifiable snippets from the funder's own pages. Statements without a citation are derived from those sources or from IIAL's evaluator output.`,
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
      const timeline = eventsByGrant.get(r.id) ?? [];
      if (evidence.length > 0) grantsWithEvidence++;
      totalSpans += evidence.length;

      const daysLeft = r.deadline
        ? Math.ceil((new Date(r.deadline).getTime() - Date.now()) / 86_400_000)
        : null;

      parts.push(
        `## ${r.title}`,
        ``,
        `| Field | Value |`,
        `|---|---|`,
        `| Funder | ${funder?.name ?? "—"}${funder?.jurisdiction ? ` _(${funder.jurisdiction})_` : ""} |`,
        `| Funder website | ${funder?.website ? `<${funder.website}>` : "—"} |`,
        `| Program URL | <${r.url}> |`,
        `| Amount | ${fmtMoney(r.amount_cad_min, r.currency)} – ${fmtMoney(r.amount_cad_max, r.currency)} |`,
        `| Deadline | ${r.deadline ?? "—"}${daysLeft != null ? ` _(${daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days overdue`})_` : ""} |`,
        `| Sectors | ${(r.sectors ?? []).join(", ") || "—"} |`,
        `| Status | \`${r.status}\` |`,
        `| Fit score | ${r.fit_score ?? evalRow?.fit_score ?? "—"} / 100 |`,
        `| Language | ${r.language} |`,
        `| Discovered | ${r.discovered_at.slice(0, 10)}${r.enriched_at ? ` · Enriched ${r.enriched_at.slice(0, 10)}` : ""}${r.scored_at ? ` · Scored ${r.scored_at.slice(0, 10)}` : ""} |`,
        `| IIAL id | \`${r.id}\` |`,
        ``,
      );

      if (r.summary) {
        parts.push(`### Program summary`, ``, r.summary.trim(), ``);
      }

      const elig = formatEligibility(r.eligibility);
      if (elig) {
        parts.push(`### Eligibility (as published)`, ``, elig, ``);
      }

      if (evalRow?.rationale) {
        parts.push(
          `### IIAL fit rationale`,
          ``,
          `**Score:** ${evalRow.fit_score} / 100  ·  **Eligibility verdict:** ${evalRow.eligibility_pass ? "pass" : "fail"}`,
          ``,
          evalRow.rationale,
          ``,
        );
      }

      // Sources — grouped by field for scannability.
      if (evidence.length > 0) {
        parts.push(`### Sources (verifiable evidence — ${evidence.length} span(s))`, ``);
        const capped = evidence.slice(0, MAX_SPANS_PER_GRANT);
        const byField = new Map<string, typeof capped>();
        for (const s of capped) {
          const list = byField.get(s.field) ?? [];
          list.push(s);
          byField.set(s.field, list);
        }
        let citationIdx = 0;
        for (const [field, list] of byField) {
          parts.push(`**${field}**`, ``);
          for (const s of list) {
            citationIdx++;
            const conf = Math.round(Number(s.confidence ?? 0) * 100);
            const snippet = (s.snippet ?? "").trim().replace(/\s+/g, " ").slice(0, 320);
            const value = (typeof s.value === "string" ? s.value : JSON.stringify(s.value))?.slice(
              0,
              160,
            );
            parts.push(
              `[${citationIdx}] _${s.agent} · ${s.extraction_method} · ${conf}% confidence_${value ? ` → \`${value}\`` : ""}`,
              `> ${snippet || "(no snippet captured)"}`,
              `Source: <${s.source_url}>`,
              ``,
            );
          }
        }
      } else {
        parts.push(
          `### Sources`,
          ``,
          `_No verified evidence spans yet — re-run the Enricher to populate citations._`,
          ``,
        );
      }

      // Timeline (gives NotebookLM context on velocity and curator decisions).
      if (timeline.length > 0) {
        parts.push(`### Workflow timeline`, ``);
        for (const e of timeline.slice(-MAX_EVENTS_PER_GRANT)) {
          const who = e.actor_agent ?? "curator";
          const transition = `${e.from_status ?? "∅"} → **${e.to_status}**`;
          const reason = e.reason ? ` · ${e.reason}` : "";
          parts.push(
            `- \`${e.created_at.slice(0, 16).replace("T", " ")}\` · ${who} · ${transition}${reason}`,
          );
        }
        parts.push(``);
      }

      // Per-grant suggested questions.
      parts.push(
        `### Suggested questions for NotebookLM`,
        ``,
        `- What is the exact eligibility criterion for "${funder?.name ?? "this funder"}"?`,
        `- Does this program require partnership with a specific entity type?`,
        `- What is the cost-share / cash-match obligation, and can it be in-kind?`,
        `- What mandatory artefacts are required (letters of support, audited financials, board resolutions)?`,
        `- What is the realistic preparation timeline given ${r.deadline ? `the deadline ${r.deadline}` : "no fixed deadline"}?`,
        `- What reporting and disbursement schedule should we expect if funded?`,
        ``,
        `---`,
        ``,
      );
    }

    // Global appendix (only meaningful for multi-grant scopes).
    if (!singleScope) {
      parts.push(
        `## Cross-grant questions for NotebookLM`,
        ``,
        `- Which 3 grants offer the best risk-adjusted return for IIAL as **Lead**?`,
        `- Which grants fit better as **Partner** (lower lift, faster turnaround)?`,
        `- Group the grants by IIAL capability (WCIS / micro-credentials / applied research / smart cities / climate / international dev).`,
        `- Flag any grant where eligibility is ambiguous and needs a phone call to the funder.`,
        `- Build a 90-day calendar of prep windows and submission dates.`,
        `- Which funders should we cultivate a long-term relationship with based on disbursement patterns?`,
        ``,
      );
    }

    parts.push(
      `## Briefing quality`,
      ``,
      `- Grants included: ${rows.length}`,
      `- Grants with verified citations: ${grantsWithEvidence}`,
      `- Total evidence spans: ${totalSpans}`,
      `- Per-user evaluations included: ${evalByGrant.size}`,
      ``,
      `_Source: IIAL grant intelligence platform. Citations come from the funders' own published pages and are extracted with deterministic + LLM-assisted methods, then validated against the source markdown before storage._`,
      ``,
    );

    const markdown = parts.join("\n");

    // ── Optional auto-shortlist (skip in single-grant deep-dives).
    // Enforce forward-only: only bump from earlier statuses, never from terminal.
    let shortlistedCount = 0;
    const TERMINAL = new Set(["submitted", "won", "lost", "expired", "archived"]);
    if (data.autoShortlist && !singleScope) {
      const toBump = rows.filter(
        (r) =>
          r.status !== "shortlisted" &&
          r.status !== "in_proposal" &&
          !TERMINAL.has(r.status as GrantStatus),
      );
      if (toBump.length > 0) {
        const ts = new Date().toISOString();
        for (const r of toBump) {
          const { error: uerr } = await supabase
            .from("grants")
            .update({ status: "shortlisted", updated_at: ts } as never)
            .eq("id", r.id);
          if (uerr) continue;
          shortlistedCount++;
          // The grants_log_transition trigger records this transition with
          // actor_user_id = auth.uid() (migration 20260703080000); inserting
          // here as well would duplicate the immutable audit timeline.
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
  } catch (e) {
    // Deep-dive / briefing should NEVER corrupt a grant record on failure:
    // every grant mutation (status=shortlisted, grant_events insert) only
    // happens AFTER the markdown build succeeds, so any throw here aborts
    // before we touched user data. Surface a safe error envelope so the
    // bridge can render a retry UI instead of bubbling a 500.
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false as const,
      reason: "briefing_error" as const,
      scope: opts.data.scope,
      message,
    };
  }
}
