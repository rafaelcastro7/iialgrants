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
  evaluation?: { eligibility_pass: boolean; fit_score?: number } | null;
};

export type SortKey = "fit" | "deadline" | "amount" | "newest";

export const SORT_LABELS: Record<SortKey, string> = {
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
  opts: { search: string; jurisdiction: string; eligibleOnly: boolean; onlyWithDeadline: boolean },
): T[] {
  const q = opts.search.trim().toLowerCase();
  return grants.filter((g) => {
    if (q) {
      const funder = funderOf(g);
      const hay = `${g.title ?? ""} ${funder?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (opts.jurisdiction !== "all") {
      if ((funderOf(g)?.jurisdiction ?? "") !== opts.jurisdiction) return false;
    }
    if (opts.eligibleOnly && !g.evaluation?.eligibility_pass) return false;
    if (opts.onlyWithDeadline && !g.deadline) return false;
    return true;
  });
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
