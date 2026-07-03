// SOP Stage 3: Opportunity Brief generator (IIAL Grant Finding v2).
// Synthesizes a structured one-page brief for leadership go/no-go decision.
// Uses deterministic data (grant + org + fit_rules + rule engine) and a single
// LLM call for the narrative "Strategic Angle" + "Risks" sections.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_RULES,
  evaluateRules,
  type FitRules,
  type GrantForRules,
} from "@/agents/fit-rules.server";

export type Brief = {
  program_snapshot: {
    funder: string | null;
    program: string;
    url: string | null;
    max_amount_cad: number | null;
    cost_share_pct_org: number | null;
    deadline: string | null;
    intake: "fixed" | "rolling" | "unknown";
  };
  iial_role: "lead" | "partner" | "unknown";
  strategic_angle: string;
  mandatory_components: string[];
  money: {
    request_amount: number | null;
    match_required_pct: number | null;
    in_kind_cap_pct: number | null;
    cash_match_verified: boolean;
  };
  risks: string[];
  recommendation: {
    verdict: "go" | "no_go" | "go_conditional";
    reason: string;
    conditions: string[];
  };
  filters: { id: string; label: string; status: string; hard: boolean; detail: string }[];
};

export const generateOpportunityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { grantId } = data;
    const { supabase, userId } = context;

    const [{ data: g, error: gerr }, { data: rulesRow }, { data: org }] = await Promise.all([
      supabase
        .from("grants")
        .select(
          "id, title, summary, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, country, url, funder:funders(name)",
        )
        .eq("id", grantId)
        .maybeSingle(),
      supabase.from("fit_rules").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("org_profiles")
        .select("org_name, sectors, jurisdictions, stage, focus_areas")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (gerr) throw new Error(gerr.message);
    if (!g) throw new Error("grant_not_found");

    const rules = (rulesRow as FitRules | null) ?? DEFAULT_RULES;
    const rr = evaluateRules(rules, g as GrantForRules);

    // Determine intake type
    const intake: "fixed" | "rolling" | "unknown" = rr.rolling_intake
      ? "rolling"
      : g.deadline
        ? "fixed"
        : "unknown";

    // Recommendation logic (tri-state per SOP Stage 4)
    const hardFails = rr.checks.filter((c) => c.status === "fail" && c.hard);
    const softFails = rr.checks.filter((c) => c.status === "fail" && !c.hard);
    const warnings = rr.checks.filter((c) => c.status === "warn");

    let verdict: "go" | "no_go" | "go_conditional";
    let reason: string;
    const conditions: string[] = [];

    if (hardFails.length > 0) {
      verdict = "no_go";
      reason = `Hard-fail en ${hardFails.length} filtro(s): ${hardFails.map((c) => c.label).join("; ")}`;
    } else if (softFails.length > 0 || warnings.length > 0) {
      verdict = "go_conditional";
      reason = `${softFails.length} fallo(s) soft + ${warnings.length} aviso(s); requiere validación de liderazgo`;
      for (const c of [...softFails, ...warnings]) conditions.push(`${c.label}: ${c.detail}`);
    } else {
      verdict = "go";
      reason = `${rr.checks.length} filtros pasados; rule_score=${rr.rule_score}/100`;
    }

    if (rr.cost_share_pct !== null && rr.cost_share_pct > 0 && rules.require_match_verification) {
      conditions.push(
        `Verificar disponibilidad de cash match (~${rr.cost_share_pct}%) con liderazgo`,
      );
      if (verdict === "go") verdict = "go_conditional";
    }

    // Narrative parts via single cheap LLM call (Groq llama-3.3-70b — free)
    const { callLlm } = await import("@/agents/llm.server");
    const { newRunId } = await import("@/lib/otel");
    const runId = newRunId();
    let strategic_angle = "—";
    let mandatory_components: string[] = [];
    let risks: string[] = [];
    try {
      const llm = await callLlm({
        model: "groq/llama-3.3-70b-versatile",
        agent: "strategist",
        runId,
        temperature: 0.2,
        responseFormat: "json",
        messages: [
          {
            role: "system",
            content:
              "You generate one section of an IIAL Opportunity Brief (SOP v2). " +
              "Return strict JSON: {strategic_angle:string, mandatory_components:string[], risks:string[]}. " +
              "Output language: ENGLISH only. " +
              "strategic_angle = 2-3 sentences explaining which IIAL capability this program leverages and what we gain. " +
              "mandatory_components = bullet list of required studies/assessments/deliverables explicitly named in the grant. " +
              "risks = bullet list of eligibility ambiguities, capacity constraints, or open questions. " +
              "Never invent: if unknown, return an empty array.",
          },
          {
            role: "user",
            content: JSON.stringify({
              grant: {
                title: g.title,
                summary: g.summary,
                eligibility: g.eligibility,
                sectors: g.sectors,
                country: g.country,
                deadline: g.deadline,
              },
              organization: org ?? { org_name: "(unconfigured)" },
              iial_capabilities: rules.iial_capabilities,
            }),
          },
        ],
      });
      const parsed = JSON.parse(llm.text) as {
        strategic_angle?: string;
        mandatory_components?: string[];
        risks?: string[];
      };
      strategic_angle = parsed.strategic_angle?.trim() || "—";
      mandatory_components = Array.isArray(parsed.mandatory_components)
        ? parsed.mandatory_components.slice(0, 10)
        : [];
      risks = Array.isArray(parsed.risks) ? parsed.risks.slice(0, 10) : [];
    } catch (e) {
      risks.push(`(LLM narrative unavailable: ${e instanceof Error ? e.message : String(e)})`);
    }

    const funderName = (g.funder as { name?: string } | null)?.name ?? null;

    const brief: Brief = {
      program_snapshot: {
        funder: funderName,
        program: g.title as string,
        url: (g as { url?: string | null }).url ?? null,
        max_amount_cad: (g.amount_cad_max ?? g.amount_cad_min ?? null) as number | null,
        cost_share_pct_org: rr.cost_share_pct,
        deadline: (g.deadline ?? null) as string | null,
        intake,
      },
      iial_role: rr.detected_role,
      strategic_angle,
      mandatory_components,
      money: {
        request_amount: (g.amount_cad_max ?? g.amount_cad_min ?? null) as number | null,
        match_required_pct: rr.cost_share_pct,
        in_kind_cap_pct: null, // not extractable deterministically; left for manual
        cash_match_verified: false,
      },
      risks,
      recommendation: { verdict, reason, conditions },
      filters: rr.checks.map((c) => ({
        id: c.id,
        label: c.label,
        status: c.status,
        hard: c.hard,
        detail: c.detail,
      })),
    };

    return { brief };
  });
