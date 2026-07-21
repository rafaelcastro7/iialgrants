// TBS Proactive Disclosure — Grants & Contributions ingester.
// Reads the current datastore API and proposes recipients only when their
// legal name is strong evidence that they are themselves grantmakers.

import { fetchCkanRecords } from "./canada-ckan.server";
import type { RawCandidate } from "./scoring.server";

const GC_RESOURCE_ID = "1d15a62f-5656-49ad-8c88-f40ce689d831";
const REGRANT_KEYWORDS =
  /(foundation|fondation|charitable trust|grant[- ]?making|arts council|council for the arts|research council|conseil des arts|conseil de recherches)/i;

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
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  return fetchCkanRecords<GcRow>({
    resourceId: GC_RESOURCE_ID,
    fields: [
      "recipient_legal_name",
      "recipient_business_number",
      "recipient_country",
      "recipient_province",
      "recipient_type",
      "owner_org",
      "agreement_value",
      "agreement_start_date",
    ],
    sort: "agreement_start_date desc",
    maxRows: limit,
    accept: (row) =>
      (row.recipient_country === "CA" || row.recipient_country === "Canada") &&
      Boolean(row.agreement_start_date && row.agreement_start_date >= since),
    stopAfterPage: (rows) =>
      rows.some((row) => Boolean(row.agreement_start_date && row.agreement_start_date < since)),
  });
}

/** Aggregate rows into funder candidates (one per unique BN/name). */
export function extractGcCandidates(rows: GcRow[]): RawCandidate[] {
  const aggregate = new Map<
    string,
    { name: string; bn?: string; province?: string; type?: string; total: number; count: number }
  >();
  for (const row of rows) {
    const name = (row.recipient_legal_name ?? "").trim();
    if (!name || !REGRANT_KEYWORDS.test(name)) continue;
    const bn = (row.recipient_business_number ?? "").replace(/\s/g, "").slice(0, 9) || undefined;
    const key = bn ?? name.toLowerCase();
    const current = aggregate.get(key) ?? {
      name,
      bn,
      province: row.recipient_province ?? undefined,
      type: row.recipient_type ?? undefined,
      total: 0,
      count: 0,
    };
    current.total += Number(row.agreement_value ?? 0) || 0;
    current.count += 1;
    aggregate.set(key, current);
  }
  return [...aggregate.values()].map((value) => ({
    name: value.name,
    bn_number: value.bn ?? null,
    province: value.province ?? null,
    funder_type: value.type ?? "regrantor",
    source_signals: [`tbs_gc:${new Date().toISOString().slice(0, 7)}`],
    raw_metadata: { gc_grants_received: value.count, gc_total_received: value.total },
    disbursed_annual: null,
  }));
}
