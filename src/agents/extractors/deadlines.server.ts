// Deterministic deadline extractor using chrono-node (EN + FR).
// Returns the most likely application deadline as ISO YYYY-MM-DD.

import * as chrono from "chrono-node";
import { windowAround } from "@/agents/evidence.server";

const DEADLINE_HINTS_EN = [
  "deadline", "apply by", "applications close", "closing date", "submission deadline",
  "due date", "must be received by", "no later than", "expires",
];
const DEADLINE_HINTS_FR = [
  "date limite", "échéance", "avant le", "au plus tard", "fin de l'appel",
  "clôture", "expire", "date de clôture",
];

export type DeadlineMatch = {
  iso: string;            // YYYY-MM-DD
  snippet: string;
  matchOffset: number;
};

export function extractDeadline(text: string, locale: "en" | "fr" = "en"): DeadlineMatch | null {
  if (!text) return null;
  const hints = [...DEADLINE_HINTS_EN, ...DEADLINE_HINTS_FR];
  const lower = text.toLowerCase();

  // 1. Find hint positions and parse the nearest date AFTER each hint.
  const candidates: Array<{ date: Date; offset: number }> = [];
  for (const hint of hints) {
    let idx = 0;
    while ((idx = lower.indexOf(hint, idx)) !== -1) {
      const window = text.slice(idx, Math.min(text.length, idx + 240));
      const parsed = locale === "fr"
        ? chrono.fr.parse(window, new Date(), { forwardDate: true })
        : chrono.parse(window, new Date(), { forwardDate: true });
      for (const p of parsed) {
        const d = p.date();
        if (d && d > new Date()) {
          candidates.push({ date: d, offset: idx + (p.index ?? 0) });
        }
      }
      idx += hint.length;
    }
  }

  // 2. Pick the earliest future date (most relevant deadline).
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  const pick = candidates[0];
  const iso = pick.date.toISOString().slice(0, 10);
  return {
    iso,
    snippet: windowAround(text, pick.offset, 40, 180),
    matchOffset: pick.offset,
  };
}
