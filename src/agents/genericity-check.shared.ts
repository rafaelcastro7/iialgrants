// Deterministic AI-cliche / homogenization detector.
//
// Real grant reviewers describe a specific, recurring failure mode in
// AI-drafted proposals: formulaic openers and rote phrase-triads that "sound
// exactly like forty other proposals that landed on the same reviewer's
// desk" — the exact opposite of what wins a competitive grant. An LLM critic
// can miss its own generic phrasing (it produced similar phrasing itself),
// so this is a cheap, pure, deterministic check independent of any LLM
// judgment — same defense-in-depth reasoning as fit-rules' rule engine
// sitting alongside the LLM evaluator rather than replacing it.
//
// Phrase-level (not single-word) matches only, to avoid flagging legitimate
// business language ("leverage," "innovative") in isolation — only the
// specific rote constructions repeatedly named in grant-reviewer complaints.
const AI_CLICHE_PATTERNS: RegExp[] = [
  /\bin (?:an|this|today's) era of\b/i,
  /\bunprecedented (?:challenges|times|opportunity|growth)\b/i,
  /\bpoised to\b/i,
  /\bdrive measurable impact\b/i,
  /\bin today'?s fast-paced world\b/i,
  /\bit is important to note that\b/i,
  /\bunderscore(?:s)? the importance of\b/i,
  /\bat the forefront of\b/i,
  /\bparadigm shift\b/i,
  /\bgame-?changer\b/i,
  /\bholistic approach\b/i,
  /\bcutting-edge\b/i,
  /\bseamless(?:ly)? integrat/i,
  /\brobust framework\b/i,
  /\binnovative,? (?:evidence-based,?)? (?:and )?trauma-informed\b/i,
  /\bsignificant contribution to\b.*\beconomic growth\b/i,
];

export type ClicheHit = { pattern: string; snippet: string };

/** Pure — same input, same output. Used by both the critic (server) and any client-side preview. */
export function detectAiCliches(text: string): ClicheHit[] {
  const hits: ClicheHit[] = [];
  for (const re of AI_CLICHE_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 20);
      const end = Math.min(text.length, m.index + m[0].length + 20);
      hits.push({ pattern: re.source, snippet: text.slice(start, end).trim() });
    }
  }
  return hits;
}
