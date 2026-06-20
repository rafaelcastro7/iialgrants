// Business Benefits Finder (Innovation Canada) ingester.
// Open data dataset publishes an XLSX export of 1500+ live federal & provincial
// programs. To stay Worker-friendly (no XLSX libs) we use the CKAN package
// metadata to locate the latest CSV alternate, then parse line-by-line.

import type { RawCandidate } from "./scoring.server";

const PKG_URL =
  "https://open.canada.ca/data/api/3/action/package_show?id=4e75337e-70d0-4ed7-92d1-3b85192ec6b1";

type CkanResource = { url: string; format?: string; name?: string };

async function findCsvResource(): Promise<string | null> {
  const res = await fetch(PKG_URL);
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: { resources?: CkanResource[] } };
  const resources = json.result?.resources ?? [];
  // Prefer CSV, then JSON, then XLSX (which we'll fall back to skipping).
  const csv = resources.find((r) => /csv/i.test(r.format ?? "") && /eng|en/i.test(r.name ?? ""));
  return csv?.url ?? null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

export async function fetchBbfPrograms(): Promise<RawCandidate[]> {
  const csvUrl = await findCsvResource();
  if (!csvUrl) return [];
  const res = await fetch(csvUrl);
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    title: header.findIndex((h) => h.includes("title") || h.includes("name")),
    org: header.findIndex((h) => h.includes("organization") || h.includes("department") || h.includes("ministry")),
    url: header.findIndex((h) => h === "url" || h.includes("link") || h.includes("more info")),
    province: header.findIndex((h) => h === "province" || h.includes("jurisdiction")),
  };
  const seen = new Map<string, RawCandidate>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCsvLine(lines[i]);
    const org = (idx.org >= 0 ? row[idx.org] : "").trim();
    const url = (idx.url >= 0 ? row[idx.url] : "").trim();
    if (!org || org.length < 3) continue;
    const key = org.toLowerCase();
    if (seen.has(key)) {
      seen.get(key)!.source_signals.push(`bbf:${(row[idx.title] ?? "").slice(0,40)}`);
      continue;
    }
    seen.set(key, {
      name: org,
      province: idx.province >= 0 ? row[idx.province]?.trim() || null : null,
      funder_type: "Government program",
      website: url.startsWith("http") ? url : null,
      source_signals: ["bbf_programs"],
      raw_metadata: { sample_program: row[idx.title] ?? "" },
    });
  }
  return Array.from(seen.values()).slice(0, 800);
}
