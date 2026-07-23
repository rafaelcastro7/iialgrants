import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import {
  AMOUNT_PRESETS,
  collectSectors,
  funderOf,
  SORT_LABELS,
  type AmountPresetKey,
  type GrantLite,
  type SortKey,
} from "./grant-filters.utils";

export function GrantFilters({
  grants,
  search,
  setSearch,
  jurisdiction,
  setJurisdiction,
  sector,
  setSector,
  amountPreset,
  setAmountPreset,
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
  sector: string;
  setSector: (v: string) => void;
  amountPreset: AmountPresetKey;
  setAmountPreset: (v: AmountPresetKey) => void;
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
  const sectors = collectSectors(grants);

  const active =
    search.trim() !== "" ||
    jurisdiction !== "all" ||
    sector !== "all" ||
    amountPreset !== "all" ||
    eligibleOnly ||
    onlyWithDeadline;
  const clearAll = () => {
    setSearch("");
    setJurisdiction("all");
    setSector("all");
    setAmountPreset("all");
    setEligibleOnly(false);
    setOnlyWithDeadline(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="relative w-full sm:w-auto">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or funder..."
          aria-label="Search grants"
          className="h-9 w-full rounded-md border bg-background pl-7 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b6fa0]/40 sm:w-56"
        />
      </div>

      <label className="flex items-center gap-1 text-muted-foreground">
        <span className="hidden sm:inline">Sort</span>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
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

      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
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

      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={sector}
        onChange={(e) => setSector(e.target.value)}
        aria-label="Sector"
      >
        <option value="all">All sectors</option>
        {sectors.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setEligibleOnly(!eligibleOnly)}
        className="inline-flex min-h-9 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-pressed={eligibleOnly}
      >
        <Badge variant={eligibleOnly ? "default" : "outline"}>Eligible only</Badge>
      </button>
      <button
        type="button"
        onClick={() => setOnlyWithDeadline(!onlyWithDeadline)}
        className="inline-flex min-h-9 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-pressed={onlyWithDeadline}
      >
        <Badge variant={onlyWithDeadline ? "default" : "outline"}>With deadline</Badge>
      </button>

      {active && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Clear filters"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
