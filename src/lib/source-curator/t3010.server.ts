// CRA T3010 ingester. Joins the current annual identification and financial
// datastore resources by business number and surfaces substantial foundations.

import { fetchCkanRecords } from "./canada-ckan.server";
import type { RawCandidate } from "./scoring.server";

const IDENTIFICATION_RESOURCE_ID = "694fdc72-eae4-4ee0-83eb-832ab7b230e3";
const FINANCIAL_RESOURCE_ID = "e545170c-3689-4833-b2a8-e9e83100ab59";

type Row = {
  charity_name?: string | null;
  bn_registration_number?: string | null;
  category_description?: string | null;
  province?: string | null;
  city?: string | null;
  total_expenditures?: number | null;
  website?: string | null;
};

export async function fetchT3010Foundations(limit = 500): Promise<Row[]> {
  type Identification = {
    BN?: string;
    Designation?: string;
    "Legal Name"?: string;
    City?: string;
    Province?: string;
  };
  // CRA line 5050 is gifts to qualified donees. Line 5100 is total
  // expenditures and must never be used as a proxy for grantmaking.
  type Financial = { BN?: string; "5050"?: string | number };

  const [publicFoundations, privateFoundations, financialRows] = await Promise.all([
    fetchCkanRecords<Identification>({
      resourceId: IDENTIFICATION_RESOURCE_ID,
      fields: ["BN", "Designation", "Legal Name", "City", "Province"],
      filters: { Designation: "A" },
      maxRows: 10_000,
    }),
    fetchCkanRecords<Identification>({
      resourceId: IDENTIFICATION_RESOURCE_ID,
      fields: ["BN", "Designation", "Legal Name", "City", "Province"],
      filters: { Designation: "B" },
      maxRows: 10_000,
    }),
    fetchCkanRecords<Financial>({
      resourceId: FINANCIAL_RESOURCE_ID,
      fields: ["BN", "5050"],
      maxRows: 100_000,
    }),
  ]);
  const expenditures = new Map(
    financialRows.map((row) => [String(row.BN ?? "").replace(/\D/g, ""), Number(row["5050"] ?? 0)]),
  );
  return [...publicFoundations, ...privateFoundations]
    .map(
      (row): Row => ({
        charity_name: row["Legal Name"] ?? null,
        bn_registration_number: row.BN ?? null,
        category_description: row.Designation === "A" ? "Public foundation" : "Private foundation",
        province: row.Province ?? null,
        city: row.City ?? null,
        total_expenditures: expenditures.get(String(row.BN ?? "").replace(/\D/g, "")) ?? null,
        website: null,
      }),
    )
    .filter((row) => Number(row.total_expenditures ?? 0) > 500_000)
    .sort((a, b) => Number(b.total_expenditures ?? 0) - Number(a.total_expenditures ?? 0))
    .slice(0, limit);
}

export function extractT3010Candidates(rows: Row[]): RawCandidate[] {
  return rows.flatMap((row) => {
    const name = (row.charity_name ?? "").trim();
    if (name.length < 3) return [];
    const bn = (row.bn_registration_number ?? "").replace(/\D/g, "").slice(0, 9);
    return [
      {
        name,
        bn_number: bn || null,
        province: row.province ?? null,
        funder_type: row.category_description ?? "Foundation",
        website: row.website?.startsWith("http") ? row.website : null,
        source_signals: ["t3010_charities"],
        disbursed_annual: row.total_expenditures ?? null,
        raw_metadata: {
          city: row.city,
          raw_category: row.category_description,
          financial_metric: "T3010_line_5050_gifts_to_qualified_donees",
        },
      },
    ];
  });
}
