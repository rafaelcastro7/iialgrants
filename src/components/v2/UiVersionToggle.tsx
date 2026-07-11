import { cn } from "@/lib/utils";
import { useUiVersion } from "@/components/v2/ui-version";

export function UiVersionToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { version, setVersion } = useUiVersion();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border bg-background p-0.5 text-xs shadow-sm",
        className,
      )}
      aria-label="UI version selector"
    >
      {(["v1", "v2"] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={version === item}
          onClick={() => setVersion(item)}
          className={cn(
            "h-7 rounded-[6px] px-2 font-semibold uppercase tracking-normal transition-colors",
            compact ? "min-w-8" : "min-w-10",
            version === item
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
