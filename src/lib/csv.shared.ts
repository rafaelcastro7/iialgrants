/**
 * csv.shared.ts
 *
 * Canonical CSV ↔ string[] helpers used across org profile, tag-input,
 * and fit-rules derivation. Single source of truth — never duplicate these.
 *
 * Rules:
 * - Splits on comma OR newline (handles both form inputs and DB-stored values)
 * - Trims whitespace from each item
 * - Drops empty strings
 * - Stable: parseCSV(serializeCSV(arr)) deep-equals arr for any clean array
 */

/**
 * Parse a comma-or-newline-separated string into a trimmed, non-empty array.
 * Also handles Postgres array literals like "{R&D,export}" — braces are stripped.
 */
export function parseCSV(value: string | null | undefined): string[] {
  if (!value) return [];
  // Strip Postgres array literal braces e.g. "{R&D,export}" → "R&D,export"
  const cleaned = value.replace(/^\{/, "").replace(/\}$/, "");
  return cleaned
    .split(/[,\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Serialize a string array back to a canonical comma-space-separated string.
 * e.g. ["nonprofit", "charity"] → "nonprofit, charity"
 */
export function serializeCSV(items: string[]): string {
  return items.join(", ");
}

/**
 * Validate a Canadian Business Number (BN).
 * Format: exactly 9 digits (the registration number portion),
 * optionally followed by a 2-letter program identifier and 4-digit reference.
 * We validate only the 9-digit root — the full 15-char BN is optional.
 *
 * Examples:
 *   "123456789"        → valid (9-digit root)
 *   "123456789RT0001"  → valid (full BN with program ID)
 *   "12345"            → invalid
 *   "ABCDEFGHI"        → invalid
 */
export function validateBN(value: string | null | undefined): boolean {
  if (!value) return true; // empty is allowed (field is optional)
  const normalized = value.replace(/\s/g, "").toUpperCase();
  return /^\d{9}([A-Z]{2}\d{4})?$/.test(normalized);
}

/**
 * Return a user-facing error message for an invalid BN, or null if valid.
 */
export function bnErrorMessage(value: string | null | undefined): string | null {
  if (validateBN(value)) return null;
  return "Business number must be 9 digits (e.g. 123456789) optionally followed by program code (e.g. RT0001).";
}
