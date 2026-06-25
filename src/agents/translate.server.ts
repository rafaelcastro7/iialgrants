// Shared French→English translation helper used by Discoverer and Enricher.
// Uses the free LLM cascade (Groq → Gemini → Cerebras) so it costs zero
// Lovable credits. Safe to call on any string; returns the original on failure.

const FRENCH_HINT =
  /\b(le|la|les|des|du|aux?|pour|avec|sans|sur|programme|subvention|prêt|prets?|aide|crédit|entreprises?|québec|développement|investissement|formation|d['’]|l['’]|qu['’])\b/i;

export function looksFrench(s: string | null | undefined): boolean {
  if (!s) return false;
  const hits = (s.match(FRENCH_HINT) ?? []).length;
  return hits >= 2 || (/[àâçéèêëîïôûùœ]/.test(s) && hits >= 1);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Translate a batch of short strings from French to English.
 * Preserves order; returns originals on any failure. Throttled for free tiers.
 */
export async function translateStringsToEnglish(opts: {
  strings: string[];
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
  runId: string;
}): Promise<string[]> {
  const items = opts.strings.map((s, i) => ({ i, s, fr: looksFrench(s) }));
  const french = items.filter((x) => x.fr);
  if (french.length === 0) return opts.strings;

  const { callFreeLlm } = await import("@/agents/llm-free.server");
  const out = [...opts.strings];
  try {
    const r = await callFreeLlm({
      agent: opts.agent, runId: opts.runId, temperature: 0,
      responseFormat: "json", allowLovableFallback: false,
      messages: [
        { role: "system", content:
          "You translate Canadian funding-program text from French to natural English. " +
          "Keep proper nouns (program names, agency names) intact. Return ONLY JSON." },
        { role: "user", content:
          `Translate each item to English. Return JSON: {"items":[{"i": <index>, "en": <string>}]}\n\n` +
          JSON.stringify(french.map(({ i, s }) => ({ i, fr: s }))) },
      ],
    });
    const parsed = JSON.parse(r.text) as { items?: Array<{ i: number; en: string }> };
    for (const { i, en } of parsed.items ?? []) {
      if (typeof en === "string" && en.trim() && !looksFrench(en)) out[i] = en;
    }
  } catch { /* keep originals */ }
  await sleep(2_000);
  return out;
}

/** Translate one optional string. Returns null/undefined unchanged. */
export async function translateMaybe(
  s: string | null | undefined,
  agent: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic",
  runId: string,
): Promise<string | null | undefined> {
  if (!s || !looksFrench(s)) return s;
  const [translated] = await translateStringsToEnglish({ strings: [s], agent, runId });
  return translated;
}
