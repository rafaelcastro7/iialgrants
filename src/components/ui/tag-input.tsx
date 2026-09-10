import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type TagInputProps = {
  /** Current comma-separated string value (compatible with react-hook-form register) */
  value?: string;
  onChange?: (csv: string) => void;
  placeholder?: string;
  /** Predefined suggestions shown in a datalist */
  suggestions?: { value: string; label: string }[];
  /** Normalise all values to lowercase */
  lowercase?: boolean;
  /** Normalise all values to UPPERCASE */
  uppercase?: boolean;
  disabled?: boolean;
  id?: string;
  /** Maximum number of tags allowed */
  max?: number;
};

function parseCSV(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function serializeCSV(tags: string[]): string {
  return tags.join(", ");
}

/**
 * A chip/tag input that replaces comma-separated `<Input>` fields.
 * Works as a controlled wrapper around a CSV string value — compatible
 * with react-hook-form's Controller or manual onChange.
 */
export function TagInput({
  value = "",
  onChange,
  placeholder = "Type and press Enter or comma",
  suggestions,
  lowercase,
  uppercase,
  disabled,
  id,
  max,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = id ? `${id}-suggestions` : undefined;

  const tags = parseCSV(value);

  function normalise(raw: string): string {
    const trimmed = raw.trim();
    if (lowercase) return trimmed.toLowerCase();
    if (uppercase) return trimmed.toUpperCase();
    return trimmed;
  }

  function addTag(raw: string) {
    const normalized = normalise(raw);
    if (!normalized) return;
    if (tags.includes(normalized)) {
      setInputValue("");
      return;
    }
    if (max != null && tags.length >= max) return;
    const next = [...tags, normalized];
    onChange?.(serializeCSV(next));
    setInputValue("");
  }

  function removeTag(index: number) {
    const next = tags.filter((_, i) => i !== index);
    onChange?.(serializeCSV(next));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addTag(inputValue);
      return;
    }
    if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
      onClick={() => inputRef.current?.focus()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      role="group"
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {listId && suggestions && (
        <datalist id={listId}>
          {suggestions
            .filter((s) => !tags.includes(lowercase ? s.value.toLowerCase() : s.value))
            .map((s) => (
              <option key={s.value} value={lowercase ? s.value.toLowerCase() : s.value}>
                {s.label}
              </option>
            ))}
        </datalist>
      )}

      <input
        ref={inputRef}
        id={id}
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value;
          // Auto-split on paste with commas
          if (v.includes(",")) {
            v.split(",").forEach((part) => addTag(part));
            return;
          }
          setInputValue(v);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (inputValue.trim()) addTag(inputValue);
        }}
        placeholder={tags.length === 0 ? placeholder : ""}
        disabled={disabled || (max != null && tags.length >= max)}
        list={listId}
        className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        aria-label={placeholder}
      />
    </div>
  );
}
