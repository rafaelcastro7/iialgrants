import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listActiveFunders } from "@/lib/grants.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "lucide-react";

export function FunderSelector({
  fr,
  selected,
  onChange,
}: {
  fr: boolean;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const fetchFunders = useServerFn(listActiveFunders);
  const { data } = useQuery({
    queryKey: ["active-funders"],
    queryFn: () => fetchFunders({}),
    staleTime: 60_000,
  });
  const funders = data?.funders ?? [];
  const label = selected.size === 0
    ? (fr ? "Tous les fournisseurs" : "All funders")
    : `${selected.size} ${fr ? "sélectionné(s)" : "selected"}`;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="flex items-center justify-between px-2 pb-2 border-b mb-2">
          <p className="text-xs font-semibold">{fr ? "Fournisseurs à exécuter" : "Funders to run"}</p>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange(new Set())}
          >
            {fr ? "Réinitialiser" : "Reset"}
          </button>
        </div>
        <ul className="max-h-64 overflow-auto space-y-0.5">
          {funders.length === 0 && (
            <li className="text-xs text-muted-foreground px-2 py-2">{fr ? "Chargement…" : "Loading…"}</li>
          )}
          {funders.map((f) => (
            <li key={f.id}>
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                <span className="flex-1 truncate">{fr && f.name_fr ? f.name_fr : f.name}</span>
                {f.jurisdiction && <span className="text-[10px] text-muted-foreground">{f.jurisdiction}</span>}
              </label>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground px-2 pt-2 border-t mt-2">
          {fr ? "Vide = tous les fournisseurs actifs." : "Empty = all active funders."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
