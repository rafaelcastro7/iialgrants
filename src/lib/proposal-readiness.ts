export type ProposalRequirement = {
  category?: string;
  requirement?: string;
  value?: string;
  isCritical?: boolean;
};

export type ProposalSectionForReadiness = {
  id: string;
  kind: string;
  heading_en: string;
  content_en: string | null;
  citations: unknown;
  critic_notes: unknown;
};

export type SectionReadiness = {
  sectionId: string;
  kind: string;
  heading: string;
  score: number;
  status: "ready" | "partial" | "blocked";
  issues: string[];
};

export type ProposalReadiness = {
  score: number;
  readySections: number;
  totalSections: number;
  criticalRequirements: number;
  coveredCriticalRequirements: number;
  sections: SectionReadiness[];
  openCriticalRequirements: string[];
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function requirementLooksCovered(requirement: ProposalRequirement, corpus: string): boolean {
  const text = `${requirement.requirement ?? ""} ${requirement.value ?? ""}`.trim();
  const tokens = words(text).filter(
    (w) => !["required", "requirement", "available", "grant", "information"].includes(w),
  );
  if (tokens.length === 0) return false;
  const sample = tokens.slice(0, 6);
  const matched = sample.filter((token) => corpus.includes(token)).length;
  // A single generic word from the requirement (e.g. "board", "application")
  // can appear anywhere in an unrelated sentence — that used to be enough
  // (.some()) to mark a critical funder deliverable "covered" with nothing
  // actually addressing it. Require a real majority of the requirement's own
  // words to show up before treating it as covered.
  return matched >= Math.max(2, Math.ceil(sample.length / 2));
}

export function computeProposalReadiness(input: {
  sections: ProposalSectionForReadiness[];
  requirements?: ProposalRequirement[] | null;
}): ProposalReadiness {
  const criticalRequirements = asArray<ProposalRequirement>(input.requirements).filter(
    (r) => r.isCritical,
  );
  const proposalCorpus = input.sections
    .map((s) => `${s.heading_en} ${s.content_en ?? ""}`)
    .join(" ")
    .toLowerCase();

  const openCriticalRequirements = criticalRequirements
    .filter((r) => !requirementLooksCovered(r, proposalCorpus))
    .map((r) => r.requirement ?? "Unnamed critical requirement");

  const sections = input.sections.map<SectionReadiness>((section) => {
    const content = (section.content_en ?? "").trim();
    const citations = asArray(section.citations);
    const notes = (section.critic_notes ?? {}) as { must_cover?: unknown };
    const mustCover = asArray<string>(notes.must_cover);
    const lower = content.toLowerCase();
    const issues: string[] = [];
    let score = 100;

    if (content.length < 120) {
      issues.push("Draft content is missing or too short.");
      score -= 45;
    }

    if (citations.length === 0) {
      issues.push("No citations attached yet.");
      score -= 25;
    }

    const missingMustCover = mustCover.filter((item) => {
      const tokens = words(item);
      if (tokens.length === 0) return false;
      return !tokens.slice(0, 4).some((token) => lower.includes(token));
    });
    if (missingMustCover.length > 0) {
      issues.push(`Missing planned point(s): ${missingMustCover.slice(0, 2).join("; ")}.`);
      score -= Math.min(30, missingMustCover.length * 10);
    }

    const finalScore = Math.max(0, Math.min(100, score));
    return {
      sectionId: section.id,
      kind: section.kind,
      heading: section.heading_en,
      score: finalScore,
      status: finalScore >= 80 ? "ready" : finalScore >= 45 ? "partial" : "blocked",
      issues,
    };
  });

  const totalSections = sections.length;
  const readySections = sections.filter((s) => s.status === "ready").length;
  const sectionAverage =
    totalSections === 0
      ? 0
      : Math.round(sections.reduce((sum, section) => sum + section.score, 0) / totalSections);
  const requirementPenalty =
    criticalRequirements.length === 0
      ? 0
      : Math.round((openCriticalRequirements.length / criticalRequirements.length) * 20);

  return {
    score: Math.max(0, sectionAverage - requirementPenalty),
    readySections,
    totalSections,
    criticalRequirements: criticalRequirements.length,
    coveredCriticalRequirements: criticalRequirements.length - openCriticalRequirements.length,
    sections,
    openCriticalRequirements,
  };
}
