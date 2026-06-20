// CRA T3010 charity-registry ingester. Surfaces Canadian public + private
// foundations large enough to be grant-makers. Uses the Open Government
// CKAN datastore SQL endpoint over the T3010 quick-view dataset.
//
// Filter strategy (cheap, no full CSV download):
//   - charity category in foundation list
//   - total expenditures > $500k
//   - returns up to 500 rows; orchestrator de-dupes.

import type { RawCandidate } from "./scoring.server";

const CKAN_SQL = "https://open.canada.ca/data/api/3/action/datastore_search_sql";
// Resource id of the latest T3010 "quick view" annualized file. Verified June 2026.
const RESOURCE_ID = "274b819a-9d24-4cf4-9c95-2e8b6dabec55";

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
  const sql =
    `SELECT charity_name, bn_registration_number, category_description, ` +
    `province, city, total_expenditures, website ` +
    `FROM "${RESOURCE_ID}" ` +
    `WHERE category_description ILIKE '%foundation%' ` +
    `AND total_expenditures > 500000 ` +
    `ORDER BY total_expenditures DESC NULLS LAST ` +
    `LIMIT ${limit}`;
  const url = `${CKAN_SQL}?sql=${encodeURIComponent(sql)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`t3010_${res.status}`);
    const json = (await res.json()) as { result?: { records?: Row[] } };
    return json.result?.records ?? [];
  } finally { clearTimeout(t); }
}

export function extractT3010Candidates(rows: Row[]): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const r of rows) {
    const name = (r.charity_name ?? "").trim();
    if (!name || name.length < 3) continue;
    const bn = (r.bn_registration_number ?? "").replace(/\D/g, "").slice(0, 9);
    out.push({
      name,
      bn_number: bn || null,
      province: r.province ?? null,
      funder_type: r.category_description ?? "Foundation",
      website: r.website?.startsWith("http") ? r.website : null,
      source_signals: ["t3010_charities"],
      disbursed_annual: r.total_expenditures ?? null,
      raw_metadata: { city: r.city, raw_category: r.category_description },
    });
  }
  return out;
}
