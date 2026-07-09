import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROMPTS, StrategistOutput } from "@/agents/schemas";
import { resolveModel } from "@/agents/model-router.server";

// Local models sometimes wrap JSON in ```fences``` or add a sentence before it.
// Strip fences and slice to the outermost object so a strict schema parse does
// not fail on cosmetic wrapping (the historical strategist parse_error cause).
function extractJsonObject(text: string): string {
  let t = (text ?? "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return t;
}

type TemplateSection = { kind: string; heading_en: string; heading_fr?: string | null };
type SectionHint = { angle?: string; must_cover?: string[] };
const STRATEGIST_KINDS = new Set([
  "summary",
  "problem",
  "solution",
  "impact",
  "budget",
  "team",
  "timeline",
  "sustainability",
  "evaluation",
  "other",
]);
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

// Coerce the strategist LLM output into a valid StrategistOutput by ANCHORING on
// the template sections (deterministic structure) and enriching angle/must_cover
// from whatever the model returned — an array under `sections`, or named keys
// like `introduction: {...}`. Local 8B models drift from the exact schema, so we
// never trust their shape; we only harvest their content. Guarantees the schema
// passes (title >= 3 chars, >= 3 valid sections).
function coerceStrategistPlan(
  raw: unknown,
  grantTitle: string,
  templateSections: TemplateSection[],
): StrategistOutput {
  const obj = asRecord(raw);
  let title = typeof obj.proposal_title === "string" ? obj.proposal_title.trim() : "";
  if (title.length < 3) title = `Proposal — ${grantTitle}`.slice(0, 300);

  const hints = new Map<string, SectionHint>();
  const addHint = (key: string, val: unknown) => {
    const v = asRecord(val);
    const angle =
      typeof v.angle === "string" ? v.angle : typeof v.summary === "string" ? v.summary : undefined;
    const must_cover = Array.isArray(v.must_cover)
      ? v.must_cover.filter((x): x is string => typeof x === "string")
      : undefined;
    if (key && (angle || must_cover)) hints.set(key.toLowerCase(), { angle, must_cover });
  };
  if (Array.isArray(obj.sections)) {
    for (const s of obj.sections) {
      const sr = asRecord(s);
      const k =
        typeof sr.kind === "string"
          ? sr.kind
          : typeof sr.heading_en === "string"
            ? sr.heading_en
            : "";
      addHint(k, s);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "proposal_title" || k === "proposal_title_fr" || k === "sections") continue;
    addHint(k, v);
  }

  const sections = (templateSections.length ? templateSections : []).slice(0, 12).map((tsec) => {
    const kind = STRATEGIST_KINDS.has(tsec.kind) ? tsec.kind : "other";
    const h = hints.get(tsec.kind.toLowerCase()) ?? hints.get(tsec.heading_en.toLowerCase()) ?? {};
    let angle = (h.angle ?? "").trim();
    if (angle.length < 10) {
      angle = `Make the case for ${tsec.heading_en} in "${grantTitle}", grounded in the grant's stated objectives and the organization's profile.`;
    }
    return {
      kind,
      heading_en: tsec.heading_en,
      heading_fr: tsec.heading_fr ?? "",
      angle: angle.slice(0, 1000),
      must_cover: (h.must_cover ?? []).slice(0, 8),
    };
  });

  return StrategistOutput.parse({ proposal_title: title, proposal_title_fr: "", sections });
}

// Plan a proposal for a grant using a template, then persist as draft.
export const runStrategist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        grantId: z.string().uuid(),
        templateId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("strategist", context.supabase as never);
    const { callLlm } = await import("@/agents/llm.server");
    const { newRunId } = await import("@/lib/otel");
    const runId = newRunId();
    const t0 = Date.now();

    const [{ data: g, error: ge }, { data: org, error: oe }, { data: tpl, error: te }] =
      await Promise.all([
        context.supabase
          .from("grants")
          .select(
            "id, title, title_fr, summary, summary_fr, amount_cad_min, amount_cad_max, deadline, eligibility, sectors, language, funder:funders(name, jurisdiction)",
          )
          .eq("id", data.grantId)
          .maybeSingle(),
        context.supabase
          .from("org_profiles")
          .select("org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas")
          .eq("user_id", context.userId)
          .maybeSingle(),
        data.templateId
          ? context.supabase
              .from("proposal_templates")
              .select("id, sections")
              .eq("id", data.templateId)
              .maybeSingle()
          : context.supabase
              .from("proposal_templates")
              .select("id, sections")
              .eq("is_global", true)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle(),
      ]);
    if (ge) throw new Error(ge.message);
    if (!g) throw new Error("grant_not_found");
    if (oe) throw new Error(oe.message);
    if (!org) throw new Error("org_profile_missing");
    if (te) throw new Error(te.message);
    if (!tpl) throw new Error("template_not_found");

    // A throwing LLM call (e.g. Ollama timeout on a cold model) must still
    // leave a failed agent_runs row — same observability fix as the writer.
    let llm: Awaited<ReturnType<typeof callLlm>>;
    try {
      llm = await callLlm({
        agent: "strategist",
        runId,
        temperature: 0.2,
        responseFormat: "json",
        messages: [
          {
            role: "system",
            content: `${PROMPTS.strategist.system}\nPrompt version: ${PROMPTS.strategist.version}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              grant: g,
              organization: org,
              template_sections: tpl.sections,
            }),
          },
        ],
      });
    } catch (llmErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "strategist",
        status: "failed",
        model: resolveModel("strategist"),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        grant_id: g.id,
        error: `llm_error: ${llmErr instanceof Error ? llmErr.message : "unknown"}`,
      });
      throw new Error(
        `strategist_llm_failed: ${llmErr instanceof Error ? llmErr.message : "unknown"}`,
      );
    }

    const model = resolveModel("strategist");
    let parsed;
    try {
      parsed = coerceStrategistPlan(
        JSON.parse(extractJsonObject(llm.text)),
        g.title,
        (tpl.sections ?? []) as TemplateSection[],
      );
    } catch (parseErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "strategist",
        status: "failed",
        model,
        input_tokens: llm.inputTokens ?? 0,
        output_tokens: llm.outputTokens ?? 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        grant_id: g.id,
        error: `parse_error: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
        metadata: { llm_output: llm.text?.slice(0, 200) },
      });
      throw new Error(
        `strategist_parse_failed: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
      );
    }

    // Persist proposal + sections.
    const { data: proposal, error: pe } = await context.supabase
      .from("proposals")
      .insert({
        user_id: context.userId,
        grant_id: g.id,
        template_id: tpl.id,
        title: parsed.proposal_title,
        language: (g.language ?? "en") as "en" | "fr",
        metadata: { strategist_run: runId, proposal_title_fr: parsed.proposal_title_fr },
      })
      .select("id")
      .single();
    if (pe) throw new Error(pe.message);

    const sectionRows = parsed.sections.map((s, idx) => ({
      proposal_id: proposal.id,
      user_id: context.userId,
      kind: s.kind,
      ord: idx,
      heading_en: s.heading_en,
      heading_fr: s.heading_fr,
      content_en: "",
      content_fr: "",
      critic_notes: { angle: s.angle, must_cover: s.must_cover },
    }));
    const { error: ise } = await context.supabase.from("proposal_sections").insert(sectionRows);
    if (ise) throw new Error(ise.message);

    // Transition grant: scored → shortlisted → in_proposal (best-effort).
    await context.supabase
      .from("grants")
      .update({ status: "shortlisted" })
      .eq("id", g.id)
      .eq("status", "scored");
    await context.supabase
      .from("grants")
      .update({ status: "in_proposal" })
      .eq("id", g.id)
      .eq("status", "shortlisted");

    await context.supabase.from("agent_runs").insert({
      run_id: runId,
      agent: "strategist",
      status: "succeeded",
      model,
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      user_id: context.userId,
      grant_id: g.id,
      metadata: { proposal_id: proposal.id, sections: parsed.sections.length },
    });

    return { ok: true, proposalId: proposal.id, sections: parsed.sections.length, runId };
  });
