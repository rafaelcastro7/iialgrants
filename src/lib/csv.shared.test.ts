import { describe, expect, it } from "vitest";
import { parseCSV, serializeCSV, validateBN, bnErrorMessage } from "@/lib/csv.shared";

describe("parseCSV", () => {
  it("returns empty array for null", () => {
    expect(parseCSV(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(parseCSV(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseCSV("   ")).toEqual([]);
  });

  it("parses a single value", () => {
    expect(parseCSV("nonprofit")).toEqual(["nonprofit"]);
  });

  it("parses comma-separated values", () => {
    expect(parseCSV("nonprofit, charity, academic")).toEqual(["nonprofit", "charity", "academic"]);
  });

  it("parses comma-separated values without spaces", () => {
    expect(parseCSV("nonprofit,charity,academic")).toEqual(["nonprofit", "charity", "academic"]);
  });

  it("trims whitespace from each item", () => {
    expect(parseCSV("  nonprofit  ,  charity  ")).toEqual(["nonprofit", "charity"]);
  });

  it("splits on newlines as well as commas", () => {
    expect(parseCSV("nonprofit\ncharity\nacademic")).toEqual(["nonprofit", "charity", "academic"]);
  });

  it("drops empty tokens from consecutive delimiters", () => {
    expect(parseCSV("nonprofit,,charity")).toEqual(["nonprofit", "charity"]);
  });

  it("strips Postgres array literal braces — {R&D,export}", () => {
    expect(parseCSV("{R&D,export}")).toEqual(["R&D", "export"]);
  });

  it("strips Postgres braces with internal spaces", () => {
    expect(parseCSV("{supply chain, AI}")).toEqual(["supply chain", "AI"]);
  });

  it("is stable: parseCSV(serializeCSV(arr)) === arr", () => {
    const arr = ["nonprofit", "registered charity", "academic"];
    expect(parseCSV(serializeCSV(arr))).toEqual(arr);
  });
});

describe("serializeCSV", () => {
  it("returns empty string for empty array", () => {
    expect(serializeCSV([])).toBe("");
  });

  it("returns single item without trailing comma", () => {
    expect(serializeCSV(["nonprofit"])).toBe("nonprofit");
  });

  it("joins multiple items with ', '", () => {
    expect(serializeCSV(["nonprofit", "charity"])).toBe("nonprofit, charity");
  });

  it("is stable: serializeCSV(parseCSV(str)) round-trips cleanly", () => {
    const str = "nonprofit, charity, academic";
    expect(serializeCSV(parseCSV(str))).toBe(str);
  });
});

describe("validateBN", () => {
  it("accepts null (field is optional)", () => {
    expect(validateBN(null)).toBe(true);
  });

  it("accepts undefined", () => {
    expect(validateBN(undefined)).toBe(true);
  });

  it("accepts empty string", () => {
    expect(validateBN("")).toBe(true);
  });

  it("accepts a valid 9-digit BN", () => {
    expect(validateBN("123456789")).toBe(true);
  });

  it("accepts a valid full BN with program identifier", () => {
    expect(validateBN("123456789RT0001")).toBe(true);
  });

  it("accepts BN with spaces (normalised away)", () => {
    expect(validateBN("123 456 789")).toBe(true);
  });

  it("accepts lowercase program code (normalised to upper)", () => {
    expect(validateBN("123456789rt0001")).toBe(true);
  });

  it("rejects a BN with fewer than 9 digits", () => {
    expect(validateBN("12345678")).toBe(false);
  });

  it("rejects a BN with more than 9 digits and no program code", () => {
    expect(validateBN("1234567890")).toBe(false);
  });

  it("rejects a BN with letters in the 9-digit root", () => {
    expect(validateBN("ABCDEFGHI")).toBe(false);
  });

  it("rejects a BN with malformed program code", () => {
    expect(validateBN("123456789RTX001")).toBe(false);
  });
});

describe("bnErrorMessage", () => {
  it("returns null for a valid BN", () => {
    expect(bnErrorMessage("123456789")).toBeNull();
  });

  it("returns null for empty/null (optional field)", () => {
    expect(bnErrorMessage(null)).toBeNull();
    expect(bnErrorMessage("")).toBeNull();
  });

  it("returns a string for an invalid BN", () => {
    const msg = bnErrorMessage("INVALID");
    expect(typeof msg).toBe("string");
    expect(msg!.length).toBeGreaterThan(10);
  });
});
