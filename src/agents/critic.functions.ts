import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CriticOutput, PROMPTS } from "@/agents/schemas";
import { bumpProposalVersion } from "@/lib/proposal-versioning";

export const runCritic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ proposalId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAgentEnabled } = await import("@/lib/admin-agents.functions");
    await assertAgentEnabled("critic");
    const { callLlm } = await import("@/agents/llm.server");
    const { newRunId } = await import("@/lib/otel");
    const runId = newRunId();
    const t0 = Date.now();

    const { data: proposal, error } = await context.supabase
      .from("proposals")
      .select(
        "id, title, language, grant:grants(id, title, summary, eligibility, amount_cad_min, amount_cad_max, deadline)",
      )
      .eq("id", data.proposalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proposal) throw new Error("proposal_not_found");
    const grant = Array.isArray(proposal.grant) ? proposal.grant[0] : proposal.grant;

    const { data: sections, error: se } = await context.supabase
      .from("proposal_sections")
      .select("id, kind, heading_en, content_en, citations, critic_notes")
      .eq("proposal_id", proposal.id)
      .order("ord", { ascending: true });
    if (se) throw new Error(se.message);

    // A throwing LLM call (e.g. Ollama timeout on a cold model) must still
    // leave a failed agent_runs row — same observability fix as the writer.
    let llm: Awaited<ReturnType<typeof callLlm>>;
    try {
      llm = await callLlm({
        agent: "critic",
        runId,
        temperature: 0.1,
        responseFormat: "json",
        messages: [
          {
            role: "system",
            content: `${PROMPTS.critic.system}\nPrompt version: ${PROMPTS.critic.version}`,
          },
          { role: "user", content: JSON.stringify({ grant, sections: sections ?? [] }) },
        ],
      });
    } catch (llmErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "critic",
        status: "failed",
        model: "dolphin3:latest",
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        grant_id: grant?.id ?? null,
        error: `llm_error: ${llmErr instanceof Error ? llmErr.message : "unknown"}`,
        metadata: { proposal_id: proposal.id },
      });
      throw new Error(`critic_llm_failed: ${llmErr instanceof Error ? llmErr.message : "unknown"}`);
    }
    let parsed;
    try {
      parsed = CriticOutput.parse(JSON.parse(llm.text));
    } catch (parseErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("agent_runs").insert({
        run_id: runId,
        agent: "critic",
        status: "failed",
        model: "dolphin3:latest",
        input_tokens: llm.inputTokens ?? 0,
        output_tokens: llm.outputTokens ?? 0,
        latency_ms: Date.now() - t0,
        user_id: context.userId,
        grant_id: grant?.id ?? null,
        error: `parse_error: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
        metadata: { proposal_id: proposal.id, llm_output: llm.text?.slice(0, 200) },
      });
      throw new Error(
        `critic_parse_failed: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
      );
    }

    const validIds = new Set((sections ?? []).map((s) => s.id));
    const findings = parsed.findings.filter((f) => validIds.has(f.section_id));

    const { error: ue } = await context.supabase
      .from("proposals")
      .update({
        critic_score: parsed.overall_score,
        metadata: {
          critic_summary_en: parsed.summary_en,
          critic_summary_fr: parsed.summary_fr,
          critic_run: runId,
        } as never,
      })
      .eq("id", proposal.id);
    if (ue) throw new Error(ue.message);

    // Attach findings into each section's critic_notes.
    for (const s of sections ?? []) {
      const sFindings = findings.filter((f) => f.section_id === s.id);
      const prevNotes = (s.critic_notes ?? {}) as Record<string, unknown>;
      const { error: ne } = await context.supabase
        .from("proposal_sections")
        .update({ critic_notes: { ...prevNotes, findings: sFindings } })
        .eq("id", s.id);
      if (ne) throw new Error(ne.message);
    }

    await bumpProposalVersion(context.supabase, proposal.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("agent_runs").insert({
      run_id: runId,
      agent: "critic",
      status: "succeeded",
      model: "dolphin3:latest",
      input_tokens: llm.inputTokens,
      output_tokens: llm.outputTokens,
      latency_ms: Date.now() - t0,
      user_id: context.userId,
      grant_id: grant?.id ?? null,
      metadata: {
        proposal_id: proposal.id,
        score: parsed.overall_score,
        findings: findings.length,
      },
    });
    return { ok: true, score: parsed.overall_score, findings: findings.length, runId };
  });
