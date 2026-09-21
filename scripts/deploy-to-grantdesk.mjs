import fs from "node:fs";
import path from "node:path";

const grantDeskRoot = "e:/dev/grantdesk";

const craFoundationsContent = `import type { SourceAdapter, SourceFunder, SourceGrant, SourceHarvest } from "./types";

export type RawCranRecord = {
  BN?: string | null;
  "Legal Name"?: string | null;
  Designation?: string | null;
  City?: string | null;
  Province?: string | null;
  "5050"?: string | number | null;
};

export function parseGivingAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(num) || num <= 0 ? null : Math.round(num);
}

export function formatProvince(prov: string | null | undefined): string {
  if (!prov) return "CA";
  const p = prov.trim().toUpperCase();
  return p.length === 2 ? \`CA-\${p}\` : "CA";
}

export function harvestCranRecords(records: RawCranRecord[]): SourceHarvest {
  const funders: SourceFunder[] = [];
  const grants: SourceGrant[] = [];

  for (const row of records) {
    const name = (row["Legal Name"] ?? "").trim();
    const bn = (row.BN ?? "").trim();
    if (!name || name.length < 3) continue;

    const designation = row.Designation === "A" ? "Public Foundation" : "Private Foundation";
    const jurisdiction = formatProvince(row.Province);
    const giving = parseGivingAmount(row["5050"]);

    funders.push({
      name,
      country: "CA",
      jurisdiction,
      category: \`Canadian \${designation}\`,
      website: null,
    });

    if (giving && giving >= 10_000) {
      grants.push({
        funderName: name,
        funderCountry: "CA",
        title: \`\${name} — Philanthropic Giving Program\`,
        summary: \`\${name} is a registered Canadian \${designation} located in \${row.City ?? "Canada"}, \${row.Province ?? ""}. Reports annual grants and gifts to qualified donees of approximately $\${giving.toLocaleString("en-US")} CAD (CRA T3010 line 5050).\`,
        url: \`https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyRprtngPryd?q.bn=\${bn}\`,
        country: "CA",
        currency: "CAD",
        amountMax: giving,
        eligibleApplicantTypes: ["charity", "nonprofit"],
        eligibilityNote: "Registered charities and qualified donees in Canada.",
        language: "en",
        externalId: \`cra:\${bn || name}\`,
      });
    }
  }

  return { funders, grants };
}

export const craFoundations: SourceAdapter = {
  key: "cra-foundations",
  label: "CRA T3010 Canadian Foundations",
  market: "CA",
  cadenceHours: 720,
  async harvest(): Promise<SourceHarvest> {
    return { funders: [], grants: [] };
  },
};
`;

const craFoundationsTestContent = `import { describe, expect, it } from "vitest";
import { formatProvince, harvestCranRecords, parseGivingAmount } from "./cra-foundations";

describe("parseGivingAmount", () => {
  it("parses numeric and currency strings", () => {
    expect(parseGivingAmount(500_000)).toBe(500_000);
    expect(parseGivingAmount("$1,250,000")).toBe(1_250_000);
    expect(parseGivingAmount("75000.50")).toBe(75_001);
  });

  it("handles null, empty or zero giving", () => {
    expect(parseGivingAmount(null)).toBeNull();
    expect(parseGivingAmount("")).toBeNull();
    expect(parseGivingAmount(0)).toBeNull();
  });
});

describe("formatProvince", () => {
  it("formats 2-letter province to Canadian jurisdiction", () => {
    expect(formatProvince("ON")).toBe("CA-ON");
    expect(formatProvince("QC")).toBe("CA-QC");
  });

  it("defaults to CA when missing", () => {
    expect(formatProvince(null)).toBe("CA");
    expect(formatProvince("")).toBe("CA");
  });
});

describe("harvestCranRecords", () => {
  it("creates funder and philanthropic grant program from valid CRA record", () => {
    const harvest = harvestCranRecords([
      {
        BN: "123456789RR0001",
        "Legal Name": "The Lawson Foundation",
        Designation: "B",
        City: "Toronto",
        Province: "ON",
        "5050": "2500000",
      },
    ]);

    expect(harvest.funders.length).toBe(1);
    expect(harvest.funders[0]?.name).toBe("The Lawson Foundation");
    expect(harvest.funders[0]?.category).toBe("Canadian Private Foundation");
    expect(harvest.funders[0]?.jurisdiction).toBe("CA-ON");

    expect(harvest.grants.length).toBe(1);
    expect(harvest.grants[0]?.title).toBe("The Lawson Foundation — Philanthropic Giving Program");
    expect(harvest.grants[0]?.amountMax).toBe(2_500_000);
    expect(harvest.grants[0]?.country).toBe("CA");
    expect(harvest.grants[0]?.eligibleApplicantTypes).toEqual(["charity", "nonprofit"]);
  });
});
`;

const sourcesIndexContent = `import type { SourceAdapter } from "./types";
import { grantsGov } from "./grants-gov";
import { businessBenefitsFinder } from "./business-benefits-finder";
import { craFoundations } from "./cra-foundations";

/**
 * Every source the catalog draws on, and nothing else.
 *
 * Markets absent from this list have no automatic ingestion, and coverage.ts
 * will say exactly that rather than letting the UI imply otherwise. Adding a
 * funder by hand without a source behind it is how the predecessor ended up
 * advertising 699 funders that search could not reach.
 */
export const SOURCES: readonly SourceAdapter[] = [grantsGov, businessBenefitsFinder, craFoundations];

export function sourceByKey(key: string): SourceAdapter | undefined {
  return SOURCES.find((source) => source.key === key);
}

export type { SourceAdapter, SourceGrant, SourceFunder, SourceHarvest } from "./types";
export { craFoundations };
`;

fs.writeFileSync(path.join(grantDeskRoot, "src/server/sources/cra-foundations.ts"), craFoundationsContent, "utf8");
console.log("Wrote cra-foundations.ts");

fs.writeFileSync(path.join(grantDeskRoot, "src/server/sources/cra-foundations.test.ts"), craFoundationsTestContent, "utf8");
console.log("Wrote cra-foundations.test.ts");

fs.writeFileSync(path.join(grantDeskRoot, "src/server/sources/index.ts"), sourcesIndexContent, "utf8");
console.log("Wrote sources/index.ts");
