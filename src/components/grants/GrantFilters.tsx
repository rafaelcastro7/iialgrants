import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";

type FunderLite = { name?: string | null; jurisdiction?: string | null };

type GrantLite = {
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

const SORT_LABELS: Record<SortKey, string> = {
  fit: "Best fit",
  deadline: "Deadline",
  amount: "Amount",
  newest: "Newest",
};

function funderOf(g: GrantLite): FunderLite | null {
  return Array.isArray(g.funder) ? (g.funder[0] ?? null) : (g.funder ?? null);
}

export function GrantFilters({
  grants,
  search,
  setSearch,
  jurisdiction,
  setJurisdiction,
  sortKey,
  setSortKey,
  eligibleOnly,
  setEligibleOnly,
  onlyWithDeadline,
  setOnlyWithDeadline,
}: {
  grants: GrantLite[];
  search: string;
  setSearch: (v: string) => void;
  jurisdiction: string;
  setJurisdiction: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
  eligibleOnly: boolean;
  setEligibleOnly: (v: boolean) => void;
  onlyWithDeadline: boolean;
  setOnlyWithDeadline: (v: boolean) => void;
}) {
  const jurisdictions = Array.from(
    new Set(
      grants.map((g) => funderOf(g)?.jurisdiction ?? null).filter((x): x is string => Boolean(x)),
    ),
  ).sort();

  const active = search.trim() !== "" || jurisdiction !== "all" || eligibleOnly || onlyWithDeadline;
  const clearAll = () => {
    setSearch("");
    setJurisdiction("all");
    setEligibleOnly(false);
    setOnlyWithDeadline(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or funder…"
          aria-label="Search grants"
          className="w-52 border rounded-md pl-7 pr-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-[#3b6fa0]/40"
        />
      </div>

      {/* Sort */}
      <label className="flex items-center gap-1 text-muted-foreground">
        <span className="hidden sm:inline">Sort</span>
        <select
          className="border rounded-md px-2 py-1.5 bg-background"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort grants"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      {/* Jurisdiction */}
      <select
        className="border rounded-md px-2 py-1.5 bg-background"
        value={jurisdiction}
        onChange={(e) => setJurisdiction(e.target.value)}
        aria-label="Jurisdiction"
      >
        <option value="all">All jurisdictions</option>
        {jurisdictions.map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setEligibleOnly(!eligibleOnly)}
        className="cursor-pointer"
      >
        <Badge variant={eligibleOnly ? "default" : "outline"}>Eligible only</Badge>
      </button>
      <button
        type="button"
        onClick={() => setOnlyWithDeadline(!onlyWithDeadline)}
        className="cursor-pointer"
      >
        <Badge variant={onlyWithDeadline ? "default" : "outline"}>With deadline</Badge>
      </button>

      {active && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
          aria-label="Clear filters"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
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
