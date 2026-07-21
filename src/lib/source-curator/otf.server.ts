// Ontario Trillium Foundation open data ingester. OTF publishes a public CSV
// list of grants; their issuing organization is always "Ontario Trillium
// Foundation" but we mine *recipients* that are themselves grant-makers
// (community foundations, councils) as funder candidates.

import type { RawCandidate } from "./scoring.server";

// Publicly hosted CSV of OTF grants (verified June 2026 endpoint).
const OTF_CSV = "https://otf.ca/sites/default/files/OTF-Grants_since2000.csv";

const REGRANT_KEYWORDS =
  /(foundation|fondation|charitable trust|grant[- ]?making|arts council|council for the arts|research council|conseil des arts|conseil de recherches)/i;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "",
    inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

export async function fetchOtfRecipients(): Promise<RawCandidate[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  let text = "";
  try {
    const res = await fetch(OTF_CSV, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`otf_csv_http_${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(t);
  }
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error("otf_csv_too_short");
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxName = header.findIndex((h) => h.includes("recipient") || h.includes("organization"));
  const idxAmt = header.findIndex((h) => h.includes("amount"));
  if (idxName < 0) throw new Error("otf_csv_recipient_column_missing");
  const agg = new Map<string, { total: number; signals: number }>();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const name = (row[idxName] ?? "").trim();
    if (!name || !REGRANT_KEYWORDS.test(name)) continue;
    const amt = idxAmt >= 0 ? Number((row[idxAmt] ?? "0").replace(/[^0-9.]/g, "")) : 0;
    const cur = agg.get(name) ?? { total: 0, signals: 0 };
    cur.total += isFinite(amt) ? amt : 0;
    cur.signals += 1;
    agg.set(name, cur);
  }
  const out: RawCandidate[] = [];
  for (const [name, v] of agg.entries()) {
    if (v.total < 100_000) continue;
    out.push({
      name,
      province: "ON",
      funder_type: "Community / Re-grant",
      source_signals: ["otf_open"],
      disbursed_annual: Math.round(v.total),
      raw_metadata: { otf_grants_count: v.signals },
    });
  }
  return out.sort((a, b) => (b.disbursed_annual ?? 0) - (a.disbursed_annual ?? 0)).slice(0, 200);
}
