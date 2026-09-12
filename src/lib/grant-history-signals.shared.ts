export type DeadlinePrediction = {
  date: string;
  confidence: number;
  cadenceDays: number;
  basis: "observed_cycles" | "explicit_cadence";
  observations: number;
};

const DAY_MS = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

export function predictNextDeadline(input: {
  observedDeadlines: string[];
  explicitCadenceDays?: number | null;
  asOf?: string;
}): DeadlinePrediction | null {
  const dates = [...new Set(input.observedDeadlines)]
    .map((value) => new Date(`${value}T00:00:00Z`))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const explicit = input.explicitCadenceDays;
  if (dates.length < 2 && !(explicit && explicit >= 7 && explicit <= 730)) return null;

  const intervals = dates
    .slice(1)
    .map((date, index) => Math.round((date.getTime() - dates[index].getTime()) / DAY_MS));
  const observedCadence = intervals.length ? median(intervals) : 0;
  const annualCycle = !explicit && observedCadence >= 360 && observedCadence <= 370;
  const cadenceDays = explicit ?? (annualCycle ? 365 : Math.round(observedCadence));
  if (!Number.isFinite(cadenceDays) || cadenceDays < 7 || cadenceDays > 730) return null;

  const basis = explicit ? "explicit_cadence" : "observed_cycles";
  const latest = dates.at(-1);
  if (!latest) return null;
  const asOf = input.asOf ? new Date(`${input.asOf}T00:00:00Z`) : new Date();
  const predicted = new Date(latest);
  do {
    if (annualCycle) predicted.setUTCFullYear(predicted.getUTCFullYear() + 1);
    else predicted.setUTCDate(predicted.getUTCDate() + cadenceDays);
  } while (predicted <= asOf);

  const variability =
    intervals.length > 1
      ? median(intervals.map((value) => Math.abs(value - median(intervals)))) / cadenceDays
      : 0;
  const confidence = explicit
    ? 0.8
    : Math.max(0.5, Math.min(0.9, 0.58 + (dates.length - 2) * 0.08 - variability * 0.25));

  return {
    date: iso(predicted),
    confidence: Math.round(confidence * 100) / 100,
    cadenceDays,
    basis,
    observations: dates.length,
  };
}

export type HistoryBoost = {
  boost: number;
  factors: string[];
};

export function summarizeGivingRecords(
  raw: unknown,
  peerOrganizations: string[],
  asOfYear = new Date().getUTCFullYear(),
): {
  peerAwardCount: number;
  repeatRecipientRate: number | null;
  yearsSinceLatestAward: number | null;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { peerAwardCount: 0, repeatRecipientRate: null, yearsSinceLatestAward: null };
  }
  const normalizeName = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const peers = peerOrganizations.map(normalizeName).filter(Boolean);
  const counts = new Map<string, number>();
  let latestYear: number | null = null;
  let peerAwardCount = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const recipient = normalizeName(String(row.recipient_name ?? row.recipient ?? row.name ?? ""));
    if (recipient) {
      counts.set(recipient, (counts.get(recipient) ?? 0) + 1);
      if (peers.some((peer) => recipient.includes(peer) || peer.includes(recipient)))
        peerAwardCount++;
    }
    const year = Number(row.year ?? row.data_year ?? String(row.date ?? "").slice(0, 4));
    if (Number.isInteger(year) && year >= 1900 && year <= asOfYear)
      latestYear = Math.max(latestYear ?? year, year);
  }
  const repeatRecipients = [...counts.values()].filter((count) => count > 1).length;
  return {
    peerAwardCount,
    repeatRecipientRate: counts.size ? repeatRecipients / counts.size : null,
    yearsSinceLatestAward: latestYear == null ? null : asOfYear - latestYear,
  };
}

/** History is explanatory and bounded; it can never reverse a hard fail. */
export function computeHistoryBoost(input: {
  hardBlocked: boolean;
  peerAwardCount: number;
  repeatRecipientRate?: number | null;
  yearsSinceLatestAward?: number | null;
}): HistoryBoost {
  if (input.hardBlocked) return { boost: 0, factors: ["Eligibility hard fail; history ignored"] };
  let boost = 0;
  const factors: string[] = [];
  if (input.peerAwardCount > 0) {
    const contribution = Math.min(0.04, input.peerAwardCount * 0.01);
    boost += contribution;
    factors.push(
      `${input.peerAwardCount} award(s) to selected peers (+${contribution.toFixed(2)})`,
    );
  }
  if ((input.repeatRecipientRate ?? 0) >= 0.25) {
    boost += 0.02;
    factors.push("Repeat-recipient pattern (+0.02)");
  }
  if ((input.yearsSinceLatestAward ?? Number.POSITIVE_INFINITY) <= 2) {
    boost += 0.02;
    factors.push("Recent giving activity (+0.02)");
  }
  return { boost: Math.min(0.08, Math.round(boost * 100) / 100), factors };
}
