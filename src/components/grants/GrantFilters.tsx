import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import { funderOf, SORT_LABELS, type GrantLite, type SortKey } from "./grant-filters.utils";

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
