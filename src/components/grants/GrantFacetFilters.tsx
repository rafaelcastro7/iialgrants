import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type GrantFacetSelection = {
  applicantType: string;
  population: string;
  fundingUse: string;
  funderType: string;
  deadlineKind: string;
  evidenceState: string;
};

const EMPTY_GRANT_FACETS: GrantFacetSelection = {
  applicantType: "all",
  population: "all",
  fundingUse: "all",
  funderType: "all",
  deadlineKind: "all",
  evidenceState: "all",
};

type Counts = Record<string, Record<string, number>>;

export function GrantFacetFilters({
  counts,
  value,
  onChange,
}: {
  counts: Counts;
  value: GrantFacetSelection;
  onChange: (value: GrantFacetSelection) => void;
}) {
  const fields: Array<{
    key: keyof GrantFacetSelection;
    countKey?: string;
    label: string;
    fixed?: string[];
  }> = [
    { key: "applicantType", countKey: "applicant_types", label: "Applicant type" },
    { key: "population", countKey: "populations_served", label: "Population" },
    { key: "fundingUse", countKey: "funding_uses", label: "Funding use" },
    { key: "funderType", countKey: "funder_type", label: "Funder type" },
    {
      key: "deadlineKind",
      countKey: "deadline_kind",
      label: "Deadline evidence",
    },
    {
      key: "evidenceState",
      countKey: "evidence_state",
      label: "Evidence state",
      fixed: ["known", "unknown", "conflicting"],
    },
  ];
  const active = Object.values(value).filter((item) => item !== "all");

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/70 p-2">
      <span className="px-1 text-xs font-medium text-muted-foreground">Evidence facets</span>
      {fields.map((field) => {
        const options = field.fixed ?? Object.keys(counts[field.countKey ?? ""] ?? {});
        return (
          <select
            key={field.key}
            aria-label={field.label}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={value[field.key]}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
          >
            <option value="all">All {field.label.toLowerCase()}s</option>
            {options.map((option) => {
              const count = field.countKey ? counts[field.countKey]?.[option] : undefined;
              return (
                <option key={option} value={option}>
                  {option}
                  {count == null ? "" : ` (${count})`}
                </option>
              );
            })}
          </select>
        );
      })}
      {active.map((item) => (
        <Badge key={item} variant="secondary" className="text-[10px]">
          {item}
        </Badge>
      ))}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_GRANT_FACETS)}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Clear facets
        </button>
      )}
    </div>
  );
}
