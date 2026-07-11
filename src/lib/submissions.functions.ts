import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeProposalReadiness,
  type ProposalRequirement,
  type ProposalSectionForReadiness,
} from "@/lib/proposal-readiness";
import { bumpProposalVersion } from "@/lib/proposal-versioning";
import {
  canSubmit,
  MIN_CRITIC_SCORE_TO_SUBMIT,
  type SubmitGateInput,
} from "@/lib/submit-gate.shared";

export { canSubmit, MIN_CRITIC_SCORE_TO_SUBMIT, type SubmitGateInput };

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
  // Override the quality gate. UI sends this only after the user confirms an
  // explicit "submit anyway" on a blocked proposal.
  force: z.boolean().default(false),
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
      .select("id, grant_id, status, critic_score, grant:grants(requirements, status)")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!proposal) throw new Error("proposal_not_found");

    // Grant-status precondition, checked BEFORE any write so a mismatch can't
    // leave a submission row + submitted proposal behind a lagging grant (a
    // real desync found via browser testing: the grant-status update used to
    // silently no-op when the grant wasn't in_proposal). "submitted" is
    // accepted for idempotency (safe re-submit).
    const grantStatus = (proposal.grant as { status?: string } | null)?.status;
    if (grantStatus !== "in_proposal" && grantStatus !== "submitted") {
      throw new Error(`grant_not_in_proposal:${grantStatus ?? "unknown"}`);
    }

    // S3a reviewer-simulation gate: never submit a proposal that has not been
    // reviewed, scores poorly, has no drafted content, or leaves a critical
    // funder requirement uncovered — unless the caller explicitly forces it.
    if (!data.force) {
      const { data: gateSections } = await supabase
        .from("proposal_sections")
        .select("id, kind, heading_en, content_en, citations, critic_notes")
        .eq("proposal_id", proposal.id);
      const grant = proposal.grant as { requirements?: unknown } | null;
      const readiness = computeProposalReadiness({
        sections: (gateSections ?? []) as unknown as ProposalSectionForReadiness[],
        requirements: (grant?.requirements ?? []) as ProposalRequirement[],
      });
      const draftedSections = (gateSections ?? []).filter(
        (s) => ((s as { content_en?: string | null }).content_en ?? "").trim().length > 0,
      ).length;
      const gate = canSubmit({
        criticScore: (proposal as { critic_score?: number | null }).critic_score ?? null,
        readinessScore: readiness.score,
        openCriticalRequirements: readiness.openCriticalRequirements.length,
        draftedSections,
      });
      if (!gate.ok) {
        throw new Error(`submit_blocked:${gate.reasons.join(",")}`);
      }
    }

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

    // Advance the grant to submitted. The grant-status precondition was already
    // checked before any write (see above), so 0 affected rows here just means
    // the grant was already submitted (idempotent) — not an error.
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

    await bumpProposalVersion(supabase, proposal.id);
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
export type ProposalExportFormat = "md" | "docx" | "pdf";
export type ProposalFileExport = {
  filename: string;
  mimeType: string;
  base64: string;
  missingTranslations: string[];
};

type ProposalExportDocument = {
  title: string;
  grantLines: string[];
  versionLine: string;
  sections: Array<{
    heading: string;
    content: string;
    missingTranslation: boolean;
  }>;
  missingTranslations: string[];
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
function buildProposalExportDocument(
  proposal: ProposalExportProposal,
  sections: ProposalExportSection[],
  fr: boolean,
): ProposalExportDocument {
  const markdown = buildProposalMarkdown(proposal, sections, fr);
  const grant = proposal.grant;
  const grantLines: string[] = [];
  if (grant) {
    grantLines.push(`${fr ? "Subvention" : "Grant"}: ${(fr && grant.title_fr) || grant.title}`);
    if (grant.deadline) grantLines.push(`${fr ? "Echeance" : "Deadline"}: ${grant.deadline}`);
    if (grant.amount_cad_min != null || grant.amount_cad_max != null) {
      grantLines.push(
        `${fr ? "Montant (CAD)" : "Amount (CAD)"}: ${grant.amount_cad_min ?? "?"} - ${grant.amount_cad_max ?? "?"}`,
      );
    }
  }

  return {
    title: proposal.title,
    grantLines,
    versionLine: `${fr ? "Version" : "Version"}: ${proposal.version ?? 1} - ${fr ? "Score critique" : "Critic score"}: ${proposal.critic_score ?? "-"}`,
    sections: sections.map((s) => {
      const missingTranslation = fr && !s.content_fr;
      return {
        heading: fr ? s.heading_fr || s.heading_en : s.heading_en,
        content: missingTranslation
          ? `[Traduction francaise manquante - texte anglais ci-dessous]\n\n${s.content_en || ""}`
          : (fr ? s.content_fr : s.content_en) || "",
        missingTranslation,
      };
    }),
    missingTranslations: markdown.missingTranslations,
  };
}

function toBase64(input: string | Uint8Array | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input;
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function buildProposalDocx(doc: ProposalExportDocument): Promise<Uint8Array> {
  const docx = await import("docx");
  const children: InstanceType<typeof docx.Paragraph>[] = [
    new docx.Paragraph({ text: doc.title, heading: docx.HeadingLevel.TITLE }),
  ];

  for (const line of doc.grantLines) {
    children.push(new docx.Paragraph({ text: line }));
  }
  children.push(
    new docx.Paragraph({
      children: [new docx.TextRun({ text: doc.versionLine, italics: true })],
    }),
  );

  for (const section of doc.sections) {
    children.push(
      new docx.Paragraph({ text: section.heading, heading: docx.HeadingLevel.HEADING_1 }),
    );
    for (const paragraph of section.content.split(/\n{2,}/)) {
      const text = paragraph.trim();
      if (!text) continue;
      children.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text, italics: section.missingTranslation })],
        }),
      );
    }
  }

  const document = new docx.Document({ sections: [{ children }] });
  return docx.Packer.toBuffer(document);
}

function pdfSafeText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\n\r\t\x20-\x7e]/g, "?");
}

async function buildProposalPdf(doc: ProposalExportDocument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const addPageIfNeeded = (neededHeight: number) => {
    if (y - neededHeight >= margin) return;
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
  };

  const wrapText = (text: string, font: typeof regularFont, fontSize: number, maxWidth: number) => {
    const paragraphs = pdfSafeText(text).split(/\n+/);
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  };

  const drawTextBlock = (
    text: string,
    options: {
      font?: typeof regularFont;
      size?: number;
      gap?: number;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) => {
    const font = options.font ?? regularFont;
    const size = options.size ?? 10;
    const gap = options.gap ?? 4;
    const lineHeight = size + gap;
    for (const line of wrapText(text, font, size, pageSize[0] - margin * 2)) {
      addPageIfNeeded(lineHeight);
      if (line) {
        page.drawText(line, {
          x: margin,
          y,
          size,
          font,
          color: options.color ?? rgb(0.12, 0.14, 0.18),
        });
      }
      y -= lineHeight;
    }
  };

  drawTextBlock(doc.title, { font: boldFont, size: 18, gap: 7 });
  y -= 8;
  for (const line of doc.grantLines) drawTextBlock(line, { size: 10 });
  drawTextBlock(doc.versionLine, { size: 9, color: rgb(0.35, 0.38, 0.45) });
  y -= 12;

  for (const section of doc.sections) {
    addPageIfNeeded(42);
    drawTextBlock(section.heading, { font: boldFont, size: 13, gap: 6 });
    drawTextBlock(section.content, {
      size: 10,
      color: section.missingTranslation ? rgb(0.45, 0.32, 0.08) : rgb(0.12, 0.14, 0.18),
    });
    y -= 10;
  }

  return pdf.save();
}

export async function buildProposalFileExport(
  proposal: ProposalExportProposal,
  sections: ProposalExportSection[],
  options: { fr: boolean; format: ProposalExportFormat },
): Promise<ProposalFileExport> {
  const markdown = buildProposalMarkdown(proposal, sections, options.fr);
  const basename = `proposal-${proposal.id.slice(0, 8)}`;
  if (options.format === "md") {
    return {
      filename: `${basename}.md`,
      mimeType: "text/markdown;charset=utf-8",
      base64: toBase64(markdown.markdown),
      missingTranslations: markdown.missingTranslations,
    };
  }

  const doc = buildProposalExportDocument(proposal, sections, options.fr);
  if (options.format === "docx") {
    return {
      filename: `${basename}.docx`,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64: toBase64(await buildProposalDocx(doc)),
      missingTranslations: doc.missingTranslations,
    };
  }

  return {
    filename: `${basename}.pdf`,
    mimeType: "application/pdf",
    base64: toBase64(await buildProposalPdf(doc)),
    missingTranslations: doc.missingTranslations,
  };
}

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

export const exportProposalFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        language: z.enum(["en", "fr"]).default("en"),
        format: z.enum(["md", "docx", "pdf"]).default("md"),
      })
      .parse(i),
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

    return buildProposalFileExport(
      proposal as unknown as ProposalExportProposal,
      (sections ?? []) as unknown as ProposalExportSection[],
      { fr, format: data.format },
    );
  });
