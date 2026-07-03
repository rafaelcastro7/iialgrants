// Deterministic CAD amount extractor (EN/FR). No LLM, no credits.
// Returns the most likely min/max with a citation window for evidence.

import { windowAround } from "@/agents/evidence.server";

export type AmountMatch = {
  min: number | null;
  max: number | null;
  snippet: string;
  matchOffset: number;
  raw: string;
};

// Recognizes:
//   $50,000 | $50 000 | CAD 50,000 | 50,000 $ | 50 000 $ CA
//   up to $250,000 | jusqu'à 250 000 $ | maximum de 1 M$
//   between $50K and $250K | de 50 000 à 250 000 $
//   $1M / 1,5 M$ / 2.5 million
const NUM = String.raw`(?:\d{1,3}(?:[,\s.]\d{3})+|\d+(?:[.,]\d+)?)`;
const SUFFIX = String.raw`(?:\s*(?:k|K|M|million|millions))?`;
const CAD = String.raw`(?:\$|CAD|CA\$|\$\s*CA|\$\s*CAD)`;
// Amount: either $-prefix-number or number-suffix-$. Also handles "1 M$" (number then M$).
const AMOUNT = String.raw`(?:${CAD}\s*${NUM}${SUFFIX}|${NUM}${SUFFIX}\s*(?:M\s*\$|\$\s*CA|\$\s*CAD|\$))`;

// Range: "between X and Y", "de X à Y", "$50K-$250K", "$50K–$250K"
const RANGE = new RegExp(
  String.raw`(?:between|entre|de|from)\s+(${AMOUNT})\s+(?:and|to|et|à|à\s+un\s+maximum\s+de|jusqu['’]à)\s+(${AMOUNT})` +
    String.raw`|(${AMOUNT})\s*[-–—]\s*(${AMOUNT})`,
  "gi",
);
const UP_TO = new RegExp(
  String.raw`(?:up\s+to|jusqu['’]à|maximum\s+(?:de|of)|max\.?\s*(?:de|of)?|à\s+concurrence\s+de|not\s+(?:to\s+)?exceed)\s+(${AMOUNT})`,
  "gi",
);
// Keywords that anchor an amount to grant context.
const FUNDING_ANCHOR =
  /\b(?:fund(?:ing|ed)?|grant|award|contribut(?:ion|e)|financ(?:ement|ing)|amount|total\s+value|up\s+to|maximum|max|min(?:imum)?|eligible|approved|per\s+project|annuall?y?)\b/i;
const SINGLE = new RegExp(AMOUNT, "gi");

function parseOne(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/CAD|CA\$|\$\s*CA|\$\s*CAD|\$/gi, "")
    .replace(/\s+/g, "")
    .trim();
  // Detect suffix
  const lower = raw.toLowerCase();
  let mult = 1;
  if (/m(?:illion)?s?\b|\bM\$|\bM\b/.test(raw)) mult = 1_000_000;
  else if (/k\b/i.test(raw)) mult = 1_000;
  // Strip suffix letters
  const numStr = cleaned.replace(/[kKmM]|million[s]?/gi, "");
  // EU vs US decimal: if has both . and , the rightmost is decimal
  let n: number;
  if (numStr.includes(",") && numStr.includes(".")) {
    if (numStr.lastIndexOf(",") > numStr.lastIndexOf(".")) {
      n = parseFloat(numStr.replace(/\./g, "").replace(",", "."));
    } else {
      n = parseFloat(numStr.replace(/,/g, ""));
    }
  } else if (numStr.includes(",")) {
    // FR: 1,5 → 1.5; otherwise thousands sep
    const parts = numStr.split(",");
    if (parts.length === 2 && parts[1].length <= 2) n = parseFloat(numStr.replace(",", "."));
    else n = parseFloat(numStr.replace(/,/g, ""));
  } else {
    n = parseFloat(numStr);
  }
  if (!Number.isFinite(n)) return null;
  const value = Math.round(n * mult);
  if (value <= 0 || value > 1_000_000_000) return null;
  return value;
}

export function extractAmounts(text: string): AmountMatch | null {
  if (!text) return null;

  // 1. Range form is highest priority. Handles: "between X and Y", "de X à Y", "$50K–$250K".
  RANGE.lastIndex = 0;
  let rm: RegExpExecArray | null;
  while ((rm = RANGE.exec(text)) !== null) {
    // Groups 1,2 from word-range form; groups 3,4 from dash-range form.
    const rawMin = rm[1] ?? rm[3];
    const rawMax = rm[2] ?? rm[4];
    if (!rawMin || !rawMax) continue;
    const min = parseOne(rawMin);
    const max = parseOne(rawMax);
    if (min != null && max != null && max >= min) {
      return {
        min,
        max,
        snippet: windowAround(text, rm.index, rm[0].length),
        matchOffset: rm.index,
        raw: rm[0],
      };
    }
  }

  // 2. "up to X" / "maximum X" / "not to exceed X" form.
  UP_TO.lastIndex = 0;
  const um = UP_TO.exec(text);
  if (um) {
    const max = parseOne(um[1]);
    if (max != null) {
      return {
        min: null,
        max,
        snippet: windowAround(text, um.index, um[0].length),
        matchOffset: um.index,
        raw: um[0],
      };
    }
  }

  // 3. Single amount fallback — prefer the first amount that appears near a
  //    funding-context keyword. "Largest" was wrong: program caps often appear
  //    early and the real amount is surrounded by grant vocabulary.
  const head = text.slice(0, 5000);
  // First pass: look for an amount within 120 chars of a funding anchor.
  const anchoredAmounts: Array<{ value: number; index: number; raw: string }> = [];
  SINGLE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SINGLE.exec(head)) !== null) {
    const v = parseOne(m[0]);
    if (v == null || v < 1000) continue;
    const window = head.slice(
      Math.max(0, m.index - 120),
      Math.min(head.length, m.index + m[0].length + 120),
    );
    if (FUNDING_ANCHOR.test(window)) {
      anchoredAmounts.push({ value: v, index: m.index, raw: m[0] });
    }
  }
  if (anchoredAmounts.length > 0) {
    // Among anchored amounts, prefer the largest (most likely to be the max grant value).
    const best = anchoredAmounts.reduce((a, b) => (b.value > a.value ? b : a));
    return {
      min: null,
      max: best.value,
      snippet: windowAround(text, best.index, best.raw.length),
      matchOffset: best.index,
      raw: best.raw,
    };
  }
  // Second pass: any amount ≥ $1000 in first 3000 chars (no anchor required).
  const narrowHead = text.slice(0, 3000);
  let fallbackBest: { value: number; index: number; raw: string } | null = null;
  SINGLE.lastIndex = 0;
  while ((m = SINGLE.exec(narrowHead)) !== null) {
    const v = parseOne(m[0]);
    if (v != null && v >= 1000 && (fallbackBest == null || v > fallbackBest.value)) {
      fallbackBest = { value: v, index: m.index, raw: m[0] };
    }
  }
  if (fallbackBest) {
    return {
      min: null,
      max: fallbackBest.value,
      snippet: windowAround(text, fallbackBest.index, fallbackBest.raw.length),
      matchOffset: fallbackBest.index,
      raw: fallbackBest.raw,
    };
  }
  return null;
}
