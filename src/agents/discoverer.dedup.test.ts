// Regression tests for C5 dedup hardening, driven by REAL rows the live
// discovery inserted on 2026-07-04:
//  - The same NRC funder produced three separate rows for one program
//    ("Industrial Research Assistance Program (IRAP)", "NRC Industrial
//    Research Assistance Program (IRAP)", "National Research Council Canada
//    Industrial Research Assistance Program (IRAP)") because the funder's own
//    name inside the title generated distinct canonical keys.
//  - Administrative pages ("COVID-19 Vaccination Policy", "National Asbestos
//    Inventory", "Conflict of Interest guidance", "Public Servants Disclosure
//    Protection Act Compliance") entered the catalog as grants because their
//    acronyms (NRC/IRAP/COI) tripped the escape hatch in isGenericTitle.
import { describe, expect, it } from "vitest";
import { canonicalKey, isGenericTitle, isNonGrantUrl } from "@/agents/discoverer.impl.server";

const FUNDER_ID = "00000000-0000-0000-0000-0000000000aa";
const FUNDER_NAME = "National Research Council Canada (IRAP)";

describe("canonicalKey collapses same-funder title variants", () => {
  const variants = [
    "Industrial Research Assistance Program (IRAP)",
    "NRC Industrial Research Assistance Program (IRAP)",
    "National Research Council Canada Industrial Research Assistance Program (IRAP)",
  ];

  it("all real-world IRAP variants share one key", () => {
    const keys = new Set(variants.map((t) => canonicalKey(FUNDER_ID, t, FUNDER_NAME)));
    expect(keys.size).toBe(1);
  });

  it("title that is purely the funder name gets a stable non-degenerate key", () => {
    // Known limitation: "National Research Council Canada (IRAP) Program"
    // reduces to nothing after funder-token removal, so it falls back to the
    // undropped tokens — a distinct but stable key (repeat discoveries of the
    // same page still dedup against each other).
    const a = canonicalKey(
      FUNDER_ID,
      "National Research Council Canada (IRAP) Program",
      FUNDER_NAME,
    );
    const b = canonicalKey(FUNDER_ID, "NRC Program", FUNDER_NAME);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(
      canonicalKey(FUNDER_ID, "National Research Council Canada (IRAP) Program", FUNDER_NAME),
    ).toBe(a);
    expect(b).toMatch(/^[a-f0-9]{64}$/);
  });

  it("distinct programs of the same funder keep distinct keys", () => {
    const irap = canonicalKey(FUNDER_ID, "Industrial Research Assistance Program", FUNDER_NAME);
    const csti = canonicalKey(
      FUNDER_ID,
      "Collaborative Science, Technology and Innovation Program",
      FUNDER_NAME,
    );
    const bmc = canonicalKey(FUNDER_ID, "Biologics Manufacturing Centre Program", FUNDER_NAME);
    expect(new Set([irap, csti, bmc]).size).toBe(3);
  });

  it("word reorderings of the same words collapse", () => {
    const a = canonicalKey(FUNDER_ID, "Youth Employment Program", FUNDER_NAME);
    const b = canonicalKey(FUNDER_ID, "Employment Youth Program", FUNDER_NAME);
    expect(a).toBe(b);
  });

  it("different funders never share keys even with identical titles", () => {
    const a = canonicalKey("funder-a", "Youth Employment Program", "Funder A");
    const b = canonicalKey("funder-b", "Youth Employment Program", "Funder B");
    expect(a).not.toBe(b);
  });

  it("works without a funder name (backwards compatible)", () => {
    expect(canonicalKey(FUNDER_ID, "Some Specific Program")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("isGenericTitle rejects administrative pages despite acronyms", () => {
  const adminTitles = [
    "National Research Council Canada (IRAP) COVID-19 Vaccination Policy",
    "National Research Council Canada (IRAP) National Asbestos Inventory",
    "Guidance on managing Conflict of Interest (COI) for NRC employees",
    "National Research Council Canada (IRAP) - Public Servants Disclosure Protection Act Compliance",
    "NRC Annual Report 2025",
    "IRAP Privacy Notice",
    "NRC Terms of Use",
  ];
  for (const title of adminTitles) {
    it(`rejects: ${title.slice(0, 60)}`, () => {
      expect(isGenericTitle(title)).toBe(true);
    });
  }

  const realPrograms = [
    "Industrial Research Assistance Program (IRAP)",
    "Mitacs Accelerate Defence and Security Call",
    "PSCE Volet II - Support for Commercialization and Exportation",
    "Policy Innovation Fund", // ends in "Fund", not "Policy" — must survive
    "Youth Employment Program",
    "Subventions au titre des affiliations internationales du CNRC",
  ];
  for (const title of realPrograms) {
    it(`accepts: ${title.slice(0, 60)}`, () => {
      expect(isGenericTitle(title)).toBe(false);
    });
  }
});

// URL-path noise filter, driven by REAL non-grant pages that sat unenriched in
// the discovered backlog on 2026-07-08 (NRC corporate/policy pages the title
// filter missed because the LLM gave them plausible titles).
describe("isNonGrantUrl blocks corporate/policy pages by path", () => {
  const noise = [
    "https://nrc.canada.ca/en/corporate/values-ethics/acts-founded-wrongdoing",
    "https://nrc.canada.ca/en/corporate/values-ethics/outside-employment-guidelines",
    "https://nrc.canada.ca/en/corporate/values-ethics/policy-covid-19-vaccination",
    "https://nrc.canada.ca/en/corporate/transparency/national-inventory-asbestos",
    "https://nrc.canada.ca/en/certifications-evaluations-standards/codes-canada",
    "https://nrc.canada.ca/fr/organisation/planification-rapports/evaluation-programme",
    "https://en.wikipedia.org/wiki/Industrial_Research_Assistance_Program",
    "https://www.linkedin.com/company/nrc-irap",
  ];
  for (const url of noise) {
    it(`blocks: ${url.slice(30, 80)}`, () => {
      expect(isNonGrantUrl(url)).toBe(true);
    });
  }

  const realPrograms = [
    "https://nrc.canada.ca/en/support-technology-innovation/nrc-irap-funding",
    "https://nrc.canada.ca/en/support-technology-innovation/nrc-irap-international",
    "https://www.investquebec.com/fr/financement/investissement/capital-de-developpement",
    "https://www.investquebec.com/fr/accompagnement/conseil-daffaires",
    "https://www.mitacs.ca/mitacs-supported-eligible-research-and-adjudication",
  ];
  for (const url of realPrograms) {
    it(`allows: ${url.slice(30, 80)}`, () => {
      expect(isNonGrantUrl(url)).toBe(false);
    });
  }
});
