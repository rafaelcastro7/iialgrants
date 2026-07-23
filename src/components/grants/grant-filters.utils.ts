// Pure filter/sort helpers + shared types for the grants board. Kept separate
// from GrantFilters.tsx so that component file only exports a component (React
// Fast Refresh requirement) and these are unit-testable in isolation.

export type FunderLite = { name?: string | null; jurisdiction?: string | null };

export type GrantLite = {
  title?: string | null;
  status: string;
  funder?: FunderLite | FunderLite[] | null;
  deadline?: string | null;
  amount_cad_min?: number | null;
  amount_cad_max?: number | null;
  discovered_at?: string | null;
  fit_score?: number | null;
  sectors?: string[] | null;
  evaluation?: { eligibility_pass: boolean; fit_score?: number } | null;
};

export type SortKey = "relevance" | "fit" | "deadline" | "amount" | "newest";

// Amount-range filter, as a fixed preset list rather than a two-input range —
// every grant-database competitor (Instrumentl, Candid, GrantStation) offers
// this and IIAL's /grants didn't; presets keep it a single dropdown instead
// of a bulkier min/max pair. "all" = no filter. A grant with no known amount
// is excluded once a preset narrower than "all" is picked — we can't verify
// an unknown amount falls in range, so silently including it would be a
// false positive, not a convenience.
export type AmountPresetKey = "all" | "under25k" | "25k-100k" | "100k-500k" | "500k-plus";
export const AMOUNT_PRESETS: Array<{ key: AmountPresetKey; label: string; min: number | null; max: number | null }> = [
  { key: "all", label: "Any amount", min: null, max: null },
  { key: "under25k", label: "Under $25K", min: null, max: 25_000 },
  { key: "25k-100k", label: "$25K – $100K", min: 25_000, max: 100_000 },
  { key: "100k-500k", label: "$100K – $500K", min: 100_000, max: 500_000 },
  { key: "500k-plus", label: "$500K+", min: 500_000, max: null },
];

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Search relevance",
  fit: "Best fit",
  deadline: "Deadline",
  amount: "Amount",
  newest: "Newest",
};

export function funderOf(g: GrantLite): FunderLite | null {
  return Array.isArray(g.funder) ? (g.funder[0] ?? null) : (g.funder ?? null);
}

export function applyGrantFilters<T extends GrantLite>(
  grants: T[],
  opts: {
    search: string;
    jurisdiction: string;
    sector?: string;
    amountPreset?: AmountPresetKey;
    eligibleOnly: boolean;
    onlyWithDeadline: boolean;
  },
): T[] {
  const q = opts.search.trim().toLowerCase();
  const sector = opts.sector ?? "all";
  const amountPreset = opts.amountPreset ?? "all";
  const preset = AMOUNT_PRESETS.find((p) => p.key === amountPreset) ?? AMOUNT_PRESETS[0];
  return grants.filter((g) => {
    if (q) {
      const funder = funderOf(g);
      const hay = `${g.title ?? ""} ${funder?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (opts.jurisdiction !== "all") {
      if ((funderOf(g)?.jurisdiction ?? "") !== opts.jurisdiction) return false;
    }
    if (sector !== "all") {
      if (!(g.sectors ?? []).some((s) => s.toLowerCase() === sector.toLowerCase())) return false;
    }
    if (preset.min != null || preset.max != null) {
      const amt = g.amount_cad_max ?? g.amount_cad_min ?? null;
      if (amt == null) return false;
      if (preset.min != null && amt < preset.min) return false;
      if (preset.max != null && amt > preset.max) return false;
    }
    if (opts.eligibleOnly && !g.evaluation?.eligibility_pass) return false;
    if (opts.onlyWithDeadline && !g.deadline) return false;
    return true;
  });
}

/** Distinct sector values across a grant list, alphabetized for the filter dropdown. */
export function collectSectors(grants: GrantLite[]): string[] {
  const set = new Set<string>();
  for (const g of grants) {
    for (const s of g.sectors ?? []) {
      if (s && s.trim()) set.add(s.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function fitValue(g: GrantLite): number {
  return g.evaluation?.fit_score ?? g.fit_score ?? -1;
}
function deadlineMs(d: string | null | undefined): number {
  if (!d) return Number.POSITIVE_INFINITY;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Stable sort by the chosen key. Does not mutate the input array. */
export function sortGrants<T extends GrantLite>(grants: T[], sortKey: SortKey): T[] {
  const arr = [...grants];
  switch (sortKey) {
    case "relevance":
      // Server search already returns the complete catalog in relevance order.
      return arr;
    case "deadline":
      return arr.sort((a, b) => deadlineMs(a.deadline) - deadlineMs(b.deadline));
    case "amount":
      return arr.sort(
        (a, b) =>
          (b.amount_cad_max ?? b.amount_cad_min ?? 0) - (a.amount_cad_max ?? a.amount_cad_min ?? 0),
      );
    case "newest":
      return arr.sort((a, b) => deadlineMs(b.discovered_at) - deadlineMs(a.discovered_at));
    case "fit":
    default:
      // Eligible first → highest fit → soonest deadline.
      return arr.sort((a, b) => {
        const aEli = a.evaluation?.eligibility_pass ? 1 : 0;
        const bEli = b.evaluation?.eligibility_pass ? 1 : 0;
        if (aEli !== bEli) return bEli - aEli;
        const df = fitValue(b) - fitValue(a);
        if (df !== 0) return df;
        return deadlineMs(a.deadline) - deadlineMs(b.deadline);
      });
  }
}
