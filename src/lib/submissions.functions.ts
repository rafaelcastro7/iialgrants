import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubmitInput = z.object({
  proposalId: z.string().uuid(),
  method: z.enum(["portal", "email", "mail", "api", "other"]),
  confirmation_number: z.string().max(200).optional().nullable(),
  language: z.enum(["en", "fr"]).default("en"),
  attachments: z
    .array(z.object({ name: z.string().min(1).max(200), url: z.string().url().optional() }))
    .max(20)
    .default([]),
  notes: z.string().max(4000).optional().nullable(),
});

// Record a submission, advance grant state in_proposal → submitted,
// and bump proposal.status to 'submitted' in one shot.
export const submitProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SubmitInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proposal, error: pe } = await supabase
      .from("proposals")
      .select("id, grant_id, status")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!proposal) throw new Error("proposal_not_found");

    const { data: sub, error: se } = await supabase
      .from("submissions")
      .insert({
        user_id: userId,
        proposal_id: proposal.id,
        grant_id: proposal.grant_id,
        method: data.method,
        confirmation_number: data.confirmation_number ?? null,
        language: data.language,
        attachments: data.attachments,
        notes: data.notes ?? null,
      })
      .select("id, submitted_at")
      .single();
    if (se) throw new Error(se.message);

    const { error: ge } = await supabase
      .from("grants")
      .update({ status: "submitted" })
      .eq("id", proposal.grant_id)
      .eq("status", "in_proposal");
    if (ge) throw new Error(ge.message);

    const { error: pe2 } = await supabase
      .from("proposals")
      .update({ status: "submitted" })
      .eq("id", proposal.id);
    if (pe2) throw new Error(pe2.message);
    return { ok: true, submission: sub };
  });

const OutcomeInput = z.object({
  submissionId: z.string().uuid(),
  result: z.enum(["won", "lost", "withdrawn", "no_response"]),
  amount_awarded_cad: z.number().nonnegative().nullable().optional(),
  decision_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  feedback: z.string().max(4000).nullable().optional(),
  lessons_learned: z.string().max(4000).nullable().optional(),
});

export const recordOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OutcomeInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub, error: se } = await supabase
      .from("submissions")
      .select("id, grant_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (se) throw new Error(se.message);
    if (!sub) throw new Error("submission_not_found");

    const { error: oe } = await supabase.from("outcomes").upsert(
      {
        user_id: userId,
        submission_id: sub.id,
        grant_id: sub.grant_id,
        result: data.result,
        amount_awarded_cad: data.amount_awarded_cad ?? null,
        decision_date: data.decision_date ?? null,
        feedback: data.feedback ?? null,
        lessons_learned: data.lessons_learned ?? null,
      },
      { onConflict: "submission_id" },
    );
    if (oe) throw new Error(oe.message);

    // Transition grant to terminal state when result is won/lost.
    if (data.result === "won" || data.result === "lost") {
      const { error: ge2 } = await supabase
        .from("grants")
        .update({ status: data.result })
        .eq("id", sub.grant_id)
        .eq("status", "submitted");
      if (ge2) throw new Error(ge2.message);
    }
    return { ok: true };
  });

export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("submissions")
      .select(
        "id, submitted_at, method, confirmation_number, language, notes, grant:grants(id, title, title_fr, status), proposal:proposals(id, title), outcome:outcomes(result, amount_awarded_cad, decision_date)",
      )
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { submissions: data ?? [] };
  });

// Notification listing/marking lives in src/lib/notifications.functions.ts
// (the versions wired to NotificationBell, correctly scoped by user_id). The
// duplicate copies that used to live here were dead code and are removed.

// Pure markdown builder — extracted so it is unit-testable without a DB.
// Key property (S3b): an FR export must NOT silently emit English as if it were
// French. Sections lacking an FR translation are flagged inline AND reported in
// `missingTranslations` so the caller can warn the user.
export type ProposalExportProposal = {
  id: string;
  title: string;
  version: number | null;
  critic_score: number | null;
  grant: {
    title: string;
    title_fr: string | null;
    deadline: string | null;
    amount_cad_min: number | null;
    amount_cad_max: number | null;
  } | null;
};
export type ProposalExportSection = {
  heading_en: string;
  heading_fr: string | null;
  content_en: string | null;
  content_fr: string | null;
};

export function buildProposalMarkdown(
  proposal: ProposalExportProposal,
  sections: ProposalExportSection[],
  fr: boolean,
): { markdown: string; filename: string; missingTranslations: string[] } {
  const grant = proposal.grant;
  const lines: string[] = [];
  lines.push(`# ${proposal.title}`);
  lines.push("");
  if (grant) {
    lines.push(`> ${fr ? "Subvention" : "Grant"}: ${(fr && grant.title_fr) || grant.title}`);
    if (grant.deadline) lines.push(`> ${fr ? "Échéance" : "Deadline"}: ${grant.deadline}`);
    if (grant.amount_cad_min || grant.amount_cad_max)
      lines.push(
        `> ${fr ? "Montant (CAD)" : "Amount (CAD)"}: ${grant.amount_cad_min ?? "?"} – ${grant.amount_cad_max ?? "?"}`,
      );
  }
  lines.push("");
  lines.push(
    `*${fr ? "Version" : "Version"}: ${proposal.version ?? 1} · ${fr ? "Score critique" : "Critic score"}: ${proposal.critic_score ?? "—"}*`,
  );
  lines.push("");
  const missingTranslations: string[] = [];
  for (const s of sections) {
    const enHeading = s.heading_en;
    if (fr) {
      lines.push(`## ${s.heading_fr || enHeading}`);
      lines.push("");
      if (s.content_fr) {
        lines.push(s.content_fr);
      } else {
        missingTranslations.push(enHeading);
        lines.push("> _[Traduction française manquante — texte anglais ci-dessous]_");
        lines.push("");
        lines.push(s.content_en || "");
      }
    } else {
      lines.push(`## ${enHeading}`);
      lines.push("");
      lines.push(s.content_en || "");
    }
    lines.push("");
  }
  return {
    markdown: lines.join("\n"),
    filename: `proposal-${proposal.id.slice(0, 8)}.md`,
    missingTranslations,
  };
}

// Markdown export — safe in the Workers runtime (no native deps).
// Clients turn the string into a downloadable .md file.
export const exportProposalMarkdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), language: z.enum(["en", "fr"]).default("en") }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const fr = data.language === "fr";
    const [{ data: proposal, error: pe }, { data: sections, error: se }] = await Promise.all([
      context.supabase
        .from("proposals")
        .select(
          "id, title, status, version, critic_score, grant:grants(title, title_fr, deadline, amount_cad_min, amount_cad_max)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("proposal_sections")
        .select("ord, heading_en, heading_fr, content_en, content_fr, citations")
        .eq("proposal_id", data.id)
        .order("ord", { ascending: true }),
    ]);
    if (pe) throw new Error(pe.message);
    if (se) throw new Error(se.message);
    if (!proposal) throw new Error("proposal_not_found");

    return buildProposalMarkdown(
      proposal as unknown as ProposalExportProposal,
      (sections ?? []) as unknown as ProposalExportSection[],
      fr,
    );
  });
