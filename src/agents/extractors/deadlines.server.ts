// Deterministic deadline extractor using chrono-node (EN + FR).
// Returns the most likely application deadline as ISO YYYY-MM-DD.

import * as chrono from "chrono-node";
import { windowAround } from "@/agents/evidence.server";

const DEADLINE_HINTS_EN = [
  "deadline", "apply by", "applications close", "closing date", "submission deadline",
  "due date", "must be received by", "no later than", "expires", "closes on",
];
const DEADLINE_HINTS_FR = [
  "date limite", "échéance", "avant le", "au plus tard", "fin de l'appel",
  "clôture", "expire", "date de clôture", "ferme le",
];
const ROLLING_HINTS = [
  "rolling intake", "continuous intake", "open continuously", "accepting applications on an ongoing basis",
  "admission continue", "réception continue", "en continu",
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

  // 1. Check for rolling/continuous intake first
  for (const hint of ROLLING_HINTS) {
    const idx = lower.indexOf(hint);
    if (idx !== -1) {
      return {
        iso: "Rolling",
        snippet: windowAround(text, idx, hint.length, 120),
        matchOffset: idx,
      };
    }
  }

  // 2. Find hint positions and parse the nearest date AFTER each hint.
  const candidates: Array<{ date: Date; offset: number }> = [];
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twoYearsFuture = new Date();
  twoYearsFuture.setFullYear(twoYearsFuture.getFullYear() + 2);

  for (const hint of hints) {
    let idx = 0;
    while ((idx = lower.indexOf(hint, idx)) !== -1) {
      const window = text.slice(idx, Math.min(text.length, idx + 240));
      const parsed = locale === "fr"
        ? chrono.fr.parse(window, new Date(), { forwardDate: true })
        : chrono.parse(window, new Date(), { forwardDate: true });
      for (const p of parsed) {
        const d = p.date();
        // Allow recent past dates (programs often leave last year's deadline up while preparing the next)
        if (d && d > oneYearAgo && d < twoYearsFuture) {
          candidates.push({ date: d, offset: idx + (p.index ?? 0) });
        }
      }
      idx += hint.length;
    }
  }

  // 3. Pick the earliest future date (>= now) if one exists, otherwise the most recent past date.
  if (candidates.length === 0) return null;
  const now = new Date();
  const future = candidates.filter((c) => c.date >= now).sort((a, b) => a.date.getTime() - b.date.getTime());
  const past = candidates.filter((c) => c.date < now).sort((a, b) => b.date.getTime() - a.date.getTime());
  const pick = future.length > 0 ? future[0] : past[0];
  const iso = pick.date.toISOString().slice(0, 10);
  return {
    iso,
    snippet: windowAround(text, pick.offset, 40, 180),
    matchOffset: pick.offset,
  };
}
