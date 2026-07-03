// Alberta Open Government grant-disclosure ingester. Same CKAN pattern as TBS
// federal: pull a recent slice of grants, extract recipients that are
// themselves re-granting orgs.

import type { RawCandidate } from "./scoring.server";

// Alberta CKAN datastore — grant-disclosure dataset. Verified June 2026.
const AB_SQL = "https://open.alberta.ca/api/3/action/datastore_search_sql";
const AB_RESOURCE = "8feaba66-9eb7-49ed-8f7a-9ef2f23a30b8";
const REGRANT = /(foundation|fondation|community|trust|society|council|association|institute)/i;

type Row = {
  recipient_legal_name?: string | null;
  recipient_business_number?: string | null;
  amount?: number | null;
  ministry?: string | null;
};

export async function fetchAlbertaGrants(limit = 2000): Promise<RawCandidate[]> {
  const sql = `SELECT recipient_legal_name, recipient_business_number, amount, ministry FROM "${AB_RESOURCE}" LIMIT ${limit}`;
  const url = `${AB_SQL}?sql=${encodeURIComponent(sql)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { result?: { records?: Row[] } };
    const rows = json.result?.records ?? [];
    const agg = new Map<string, { total: number; bn: string | null; signals: number }>();
    for (const r of rows) {
      const name = (r.recipient_legal_name ?? "").trim();
      if (!name || !REGRANT.test(name)) continue;
      const cur = agg.get(name) ?? { total: 0, bn: null, signals: 0 };
      cur.total += Number(r.amount ?? 0) || 0;
      cur.bn =
        cur.bn ?? ((r.recipient_business_number ?? "").replace(/\D/g, "").slice(0, 9) || null);
      cur.signals += 1;
      agg.set(name, cur);
    }
    const out: RawCandidate[] = [];
    for (const [name, v] of agg.entries()) {
      if (v.total < 50_000) continue;
      out.push({
        name,
        bn_number: v.bn,
        province: "AB",
        funder_type: "Community / Re-grant",
        source_signals: ["alberta_ckan"],
        disbursed_annual: Math.round(v.total),
        raw_metadata: { ab_grants_count: v.signals },
      });
    }
    return out.slice(0, 150);
  } catch {
    return [];
  }
}
