// Golden tests for the deterministic extractors that previously had zero
// coverage: deadlines (chrono + boundary logic), eligibility (taxonomy rules)
// and sectors (NAICS-lite keywords). amounts.server.ts is covered separately
// in amounts.test.ts.
import { describe, expect, it } from "vitest";
import { extractDeadline } from "@/agents/extractors/deadlines.server";
import { extractEligibility } from "@/agents/extractors/eligibility.server";
import { extractSectors } from "@/agents/extractors/sectors.server";

// Local-date ISO (the extractor formats chrono's local 12:00 result, so the
// expected value must come from local date parts, not UTC toISOString()).
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const longDate = (d: Date) =>
  `${d.toLocaleString("en-US", { month: "long" })} ${d.getDate()}, ${d.getFullYear()}`;

describe("extractDeadline", () => {
  it("extracts a future deadline anchored to a hint", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const text = `Program overview. Application deadline: ${longDate(future)}. Apply online.`;
    const match = extractDeadline(text);
    expect(match).not.toBeNull();
    expect(match!.iso).toBe(iso(future));
    expect(match!.snippet.toLowerCase()).toContain("deadline");
  });

  it("treats a deadline dated TODAY as current, not past (regression)", () => {
    // Regression for the time-of-day bug: a deadline parsed at 00:00 today used
    // to be classified as past once the clock moved past midnight.
    const today = new Date();
    const text = `Applications close ${longDate(today)} at 5pm EST.`;
    const match = extractDeadline(text);
    expect(match).not.toBeNull();
    expect(match!.iso).toBe(iso(today));
  });

  it("detects rolling/continuous intake", () => {
    const match = extractDeadline("This program has a rolling intake and no fixed dates.");
    expect(match).not.toBeNull();
    expect(match!.iso).toBe("Rolling");
  });

  it("parses French deadlines with locale=fr", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 4);
    const frMonths = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ];
    const text = `Date limite : ${future.getDate()} ${frMonths[future.getMonth()]} ${future.getFullYear()}.`;
    const match = extractDeadline(text, "fr");
    expect(match).not.toBeNull();
    expect(match!.iso).toBe(iso(future));
  });

  it("returns null when no deadline hint is present", () => {
    expect(extractDeadline("A generic page about our organization and its mission.")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractDeadline("")).toBeNull();
  });
});

describe("extractEligibility", () => {
  it("tags SMEs, non-profits and indigenous applicants (EN)", () => {
    const text =
      "Eligible applicants: small and medium-sized enterprises (SMEs), " +
      "not-for-profit organizations, and First Nations communities.";
    const tags = extractEligibility(text).map((m) => m.tag);
    expect(tags).toContain("smb");
    expect(tags).toContain("non_profit");
    expect(tags).toContain("indigenous");
  });

  it("tags French variants (PME, OBNL)", () => {
    const text = "Admissibilité : les PME et les organisations à but non lucratif du Québec.";
    const tags = extractEligibility(text).map((m) => m.tag);
    expect(tags).toContain("smb");
    expect(tags).toContain("non_profit");
  });

  it("deduplicates a tag matched by multiple patterns", () => {
    const text = "Open to non-profits, not-for-profits and charities alike.";
    const tags = extractEligibility(text).filter((m) => m.tag === "non_profit");
    expect(tags).toHaveLength(1);
  });

  it("returns evidence snippets containing the matched text", () => {
    const text = "This grant supports startups building new products in Canada.";
    const match = extractEligibility(text).find((m) => m.tag === "startup");
    expect(match).toBeDefined();
    expect(match!.snippet.toLowerCase()).toContain("startups");
  });

  it("returns [] for empty or unrelated text", () => {
    expect(extractEligibility("")).toEqual([]);
    expect(extractEligibility("The weather is nice today.")).toEqual([]);
  });
});

describe("extractSectors", () => {
  it("detects multiple sectors in one page (EN)", () => {
    const text =
      "Funding for artificial intelligence projects in healthcare and clean technology adoption.";
    const sectors = extractSectors(text).map((m) => m.sector);
    expect(sectors).toContain("ai");
    expect(sectors).toContain("health");
    expect(sectors).toContain("cleantech");
  });

  it("detects French sector keywords", () => {
    const text =
      "Programme destiné aux entreprises du secteur de l'intelligence artificielle et de la santé.";
    const sectors = extractSectors(text).map((m) => m.sector);
    expect(sectors).toContain("ai");
    expect(sectors).toContain("health");
  });

  it("deduplicates a sector matched by multiple keywords", () => {
    const text = "We fund technology companies building software and IT services.";
    const matches = extractSectors(text).filter((m) => m.sector === "technology");
    expect(matches).toHaveLength(1);
  });

  it("returns [] for empty or unrelated text", () => {
    expect(extractSectors("")).toEqual([]);
    expect(extractSectors("Instructions for filling out the contact form.")).toEqual([]);
  });
});
