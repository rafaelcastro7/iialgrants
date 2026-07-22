import { createHash } from "node:crypto";

export type GrantSearchDocumentSource = {
  title: string;
  title_fr: string | null;
  summary: string | null;
  summary_fr: string | null;
  sectors: string[] | null;
  eligibility: unknown;
  requirements: unknown;
  funder?: { name?: string | null; name_fr?: string | null; jurisdiction?: string | null } | null;
};

const jsonText = (value: unknown) => {
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

export function buildGrantSearchDocument(grant: GrantSearchDocumentSource) {
  const shared = [
    grant.funder?.name,
    grant.funder?.name_fr,
    grant.funder?.jurisdiction,
    ...(grant.sectors ?? []),
    jsonText(grant.eligibility),
    jsonText(grant.requirements),
  ]
    .filter(Boolean)
    .join("\n");
  const contentEn = [grant.title, grant.summary, shared].filter(Boolean).join("\n").trim();
  const contentFr = [grant.title_fr, grant.summary_fr, shared].filter(Boolean).join("\n").trim();
  const embeddingText = [contentEn, contentFr].filter(Boolean).join("\n--- FR ---\n");
  return {
    contentEn,
    contentFr,
    embeddingText,
    contentHash: createHash("sha256").update(embeddingText).digest("hex"),
  };
}
