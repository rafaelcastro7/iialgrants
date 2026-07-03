// TBS Proactive Disclosure — Grants & Contributions ingester.
// Strategy (Worker-friendly): query the CKAN datastore API with a date filter
// for the last 35 days so we always get the most recent month even if the
// pipeline missed a run. Extract unique (recipient_legal_name, owner_org)
// combinations and propose recipients as funder candidates ONLY when their
// org type suggests they are themselves grantmakers (foundations, councils).

import type { RawCandidate } from "./scoring.server";

// Datastore resource for the "grants" CSV (updated daily).
// Verified June 2026: https://open.canada.ca/data/en/dataset/432527ab-7aac-45b5-81d6-7597107a7013
const GC_DATASTORE_URL = "https://open.canada.ca/data/api/3/action/datastore_search_sql";
const GC_RESOURCE_ID = "1d15a62f-5656-49ad-8c88-f40ce689d831";

const REGRANT_KEYWORDS =
  /(foundation|fondation|community|trust|society|société|council|conseil|association)/i;

type GcRow = {
  recipient_legal_name?: string | null;
  recipient_business_number?: string | null;
  recipient_country?: string | null;
  recipient_province?: string | null;
  recipient_type?: string | null;
  owner_org?: string | null;
  agreement_value?: number | null;
  agreement_start_date?: string | null;
};

export async function fetchRecentGcRows(daysBack = 35, limit = 5000): Promise<GcRow[]> {
  const since = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
  // Use SQL endpoint — CKAN allows safe parameterized SELECTs.
  const sql =
    `SELECT recipient_legal_name, recipient_business_number, recipient_country, ` +
    `recipient_province, recipient_type, owner_org, agreement_value, agreement_start_date ` +
    `FROM "${GC_RESOURCE_ID}" ` +
    `WHERE recipient_country = 'Canada' ` +
    `AND agreement_start_date >= '${since}' ` +
    `LIMIT ${limit}`;
  const url = `${GC_DATASTORE_URL}?sql=${encodeURIComponent(sql)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`gc_datastore_${res.status}`);
    const json = (await res.json()) as { result?: { records?: GcRow[] } };
    return json.result?.records ?? [];
  } finally {
    clearTimeout(t);
  }
}

/** Aggregate rows into funder candidates (one per unique BN/name). */
export function extractGcCandidates(rows: GcRow[]): RawCandidate[] {
  const agg = new Map<
    string,
    {
      name: string;
      bn?: string;
      province?: string;
      type?: string;
      total: number;
      count: number;
    }
  >();
  for (const r of rows) {
    const name = (r.recipient_legal_name ?? "").trim();
    if (!name) continue;
    // Only recipients that look like re-granting entities are useful as funders.
    if (
      !REGRANT_KEYWORDS.test(name) &&
      !(r.recipient_type && /foundation|trust/i.test(r.recipient_type))
    )
      continue;
    const bn = (r.recipient_business_number ?? "").replace(/\s/g, "").slice(0, 9) || undefined;
    const key = bn ?? name.toLowerCase();
    const cur = agg.get(key) ?? {
      name,
      bn,
      province: r.recipient_province ?? undefined,
      type: r.recipient_type ?? undefined,
      total: 0,
      count: 0,
    };
    cur.total += Number(r.agreement_value ?? 0) || 0;
    cur.count += 1;
    agg.set(key, cur);
  }
  const out: RawCandidate[] = [];
  for (const v of agg.values()) {
    out.push({
      name: v.name,
      bn_number: v.bn ?? null,
      province: v.province ?? null,
      funder_type: v.type ?? "regrantor",
      source_signals: ["tbs_gc:" + new Date().toISOString().slice(0, 7)],
      raw_metadata: { gc_grants_received: v.count, gc_total_received: v.total },
      disbursed_annual: null,
    });
  }
  return out;
}
