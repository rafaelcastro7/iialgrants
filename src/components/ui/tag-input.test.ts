/**
 * tag-input.test.ts
 *
 * Tests for the pure logic extracted from TagInput.
 * We test the csv integration + normalization rules without mounting React.
 */
import { describe, expect, it } from "vitest";
import { parseCSV, serializeCSV } from "@/lib/csv.shared";

// Mirrors the normalise() function inside TagInput
function normalise(raw: string, lowercase?: boolean, uppercase?: boolean): string {
  const trimmed = raw.trim();
  if (lowercase) return trimmed.toLowerCase();
  if (uppercase) return trimmed.toUpperCase();
  return trimmed;
}

// Mirrors addTag() logic
function addTag(
  current: string,
  raw: string,
  options?: { lowercase?: boolean; uppercase?: boolean; max?: number },
): string {
  const tags = parseCSV(current);
  const normalized = normalise(raw, options?.lowercase, options?.uppercase);
  if (!normalized) return current;
  if (tags.includes(normalized)) return current; // dedup
  if (options?.max != null && tags.length >= options.max) return current; // max guard
  return serializeCSV([...tags, normalized]);
}

// Mirrors removeTag() logic
function removeTag(current: string, index: number): string {
  const tags = parseCSV(current);
  return serializeCSV(tags.filter((_, i) => i !== index));
}

describe("TagInput — addTag logic", () => {
  it("adds a tag to an empty value", () => {
    expect(addTag("", "nonprofit")).toBe("nonprofit");
  });

  it("appends a tag to existing tags", () => {
    expect(addTag("nonprofit", "charity")).toBe("nonprofit, charity");
  });

  it("ignores empty string input", () => {
    expect(addTag("nonprofit", "")).toBe("nonprofit");
  });

  it("ignores whitespace-only input", () => {
    expect(addTag("nonprofit", "   ")).toBe("nonprofit");
  });

  it("trims whitespace from the new tag", () => {
    expect(addTag("nonprofit", "  charity  ")).toBe("nonprofit, charity");
  });

  it("deduplicates: does not add an already-present tag", () => {
    expect(addTag("nonprofit, charity", "nonprofit")).toBe("nonprofit, charity");
  });

  it("deduplicates after normalisation (lowercase)", () => {
    expect(addTag("nonprofit", "NONPROFIT", { lowercase: true })).toBe("nonprofit");
  });

  it("normalises to lowercase when option is set", () => {
    expect(addTag("", "Supply Chain", { lowercase: true })).toBe("supply chain");
  });

  it("normalises to uppercase when option is set", () => {
    expect(addTag("", "ca", { uppercase: true })).toBe("CA");
  });

  it("respects max limit — does not add beyond max", () => {
    const value = addTag("a, b, c", "d", { max: 3 });
    expect(value).toBe("a, b, c");
  });

  it("allows addition when count is below max", () => {
    const value = addTag("a, b", "c", { max: 3 });
    expect(value).toBe("a, b, c");
  });
});

describe("TagInput — removeTag logic", () => {
  it("removes a tag by index", () => {
    expect(removeTag("nonprofit, charity, academic", 1)).toBe("nonprofit, academic");
  });

  it("removes the first tag", () => {
    expect(removeTag("nonprofit, charity", 0)).toBe("charity");
  });

  it("removes the last tag", () => {
    expect(removeTag("nonprofit, charity", 1)).toBe("nonprofit");
  });

  it("returns empty string when removing the only tag", () => {
    expect(removeTag("nonprofit", 0)).toBe("");
  });

  it("is a no-op for an out-of-bounds index", () => {
    // filter silently drops nothing — result is unchanged
    expect(removeTag("nonprofit, charity", 99)).toBe("nonprofit, charity");
  });
});

describe("TagInput — paste splitting", () => {
  it("splits a pasted CSV string into multiple tags", () => {
    // Simulate: paste "nonprofit, charity, academic" → split on comma → addTag each
    const pasted = "nonprofit, charity, academic";
    let value = "";
    pasted.split(",").forEach((part) => {
      value = addTag(value, part);
    });
    expect(parseCSV(value)).toEqual(["nonprofit", "charity", "academic"]);
  });
});
