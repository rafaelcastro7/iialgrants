export type AnswerKnowledgeInput = {
  label: string;
  question?: string | null;
  answer_en: string;
  evidence_notes?: string | null;
};

export function formatAnswerKnowledgeChunk(input: AnswerKnowledgeInput): string {
  return [
    `Reusable response: ${input.label.trim()}`,
    input.question?.trim() ? `Question: ${input.question.trim()}` : null,
    `Approved answer: ${input.answer_en.trim()}`,
    input.evidence_notes?.trim() ? `Evidence notes: ${input.evidence_notes.trim()}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

