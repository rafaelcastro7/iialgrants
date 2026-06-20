import { Badge } from "@/components/ui/badge";

type GrantLite = {
  status: string;
  funder?: { jurisdiction?: string | null } | { jurisdiction?: string | null }[] | null;
  deadline?: string | null;
  evaluation?: { eligibility_pass: boolean } | null;
};

export function GrantFilters({
  grants, fr,
  jurisdiction, setJurisdiction,
  eligibleOnly, setEligibleOnly,
  onlyWithDeadline, setOnlyWithDeadline,
}: {
  grants: GrantLite[];
  fr: boolean;
  jurisdiction: string; setJurisdiction: (v: string) => void;
  eligibleOnly: boolean; setEligibleOnly: (v: boolean) => void;
  onlyWithDeadline: boolean; setOnlyWithDeadline: (v: boolean) => void;
}) {
  const jurisdictions = Array.from(new Set(
    grants.map((g) => {
      const f = Array.isArray(g.funder) ? g.funder[0] : g.funder;
      return f?.jurisdiction ?? null;
    }).filter((x): x is string => Boolean(x))
  )).sort();

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
      <span className="text-muted-foreground">{fr ? "Filtres :" : "Filters:"}</span>
      <select
        className="border rounded px-2 py-1 bg-background"
        value={jurisdiction}
        onChange={(e) => setJurisdiction(e.target.value)}
        aria-label={fr ? "Juridiction" : "Jurisdiction"}
      >
        <option value="all">{fr ? "Toutes juridictions" : "All jurisdictions"}</option>
        {jurisdictions.map((j) => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setEligibleOnly(!eligibleOnly)}
        className="cursor-pointer"
      >
        <Badge variant={eligibleOnly ? "default" : "outline"}>
          {fr ? "Éligibles uniquement" : "Eligible only"}
        </Badge>
      </button>
      <button
        type="button"
        onClick={() => setOnlyWithDeadline(!onlyWithDeadline)}
        className="cursor-pointer"
      >
        <Badge variant={onlyWithDeadline ? "default" : "outline"}>
          {fr ? "Avec date limite" : "With deadline"}
        </Badge>
      </button>
    </div>
  );
}

export function applyGrantFilters<T extends GrantLite>(
  grants: T[],
  opts: { jurisdiction: string; eligibleOnly: boolean; onlyWithDeadline: boolean },
): T[] {
  return grants.filter((g) => {
    if (opts.jurisdiction !== "all") {
      const f = Array.isArray(g.funder) ? g.funder[0] : g.funder;
      if ((f?.jurisdiction ?? "") !== opts.jurisdiction) return false;
    }
    if (opts.eligibleOnly && !g.evaluation?.eligibility_pass) return false;
    if (opts.onlyWithDeadline && !g.deadline) return false;
    return true;
  });
}
