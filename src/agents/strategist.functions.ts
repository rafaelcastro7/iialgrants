import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROMPTS, StrategistOutput } from "@/agents/schemas";

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

    const llm = await callLlm({
      model: "google/gemini-2.5-flash",
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
          content: JSON.stringify({ grant: g, organization: org, template_sections: tpl.sections }),
        },
      ],
    });

    let parsed;
    try {
      parsed = StrategistOutput.parse(JSON.parse(llm.text));
    } catch (parseErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "strategist",
        status: "failed",
        model: "google/gemini-2.5-flash",
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
      model: "google/gemini-2.5-flash",
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      user_id: context.userId,
      grant_id: g.id,
      metadata: { proposal_id: proposal.id, sections: parsed.sections.length },
    });

    return { ok: true, proposalId: proposal.id, sections: parsed.sections.length, runId };
  });
