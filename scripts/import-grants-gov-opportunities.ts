/**
 * US Federal opportunity importer — Grants.gov Search2 REST API.
 *
 * Complements scripts/import-cra-t3010.ts (which imports Canadian *funders*).
 * The existing source-curator only ever derived funders from Grants.gov; the
 * opportunities themselves were dropped on the floor. That left the US, LatAm
 * and multilateral funders in the directory with zero grants attached, so
 * searching "NIH" or "NSF" in /grants could never return anything — the
 * catalog RPC joins grants to funders, not the other way round.
 *
 * This imports the opportunities and links each one to its issuing agency,
 * creating the funder when it is not already in the directory.
 *
 * Source: https://api.grants.gov/v1/api/search2 (public, no auth)
 * Usage: bun run scripts/import-grants-gov-opportunities.ts [--dry-run] [--limit=N]
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:15435";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SEARCH2_URL = "https://api.grants.gov/v1/api/search2";
const PAGE_SIZE = 500;

const FLAGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DRY_RUN = Boolean(FLAGS["dry-run"]);
const MAX = FLAGS.limit ? Number(FLAGS.limit) : 2000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type OppHit = {
  id?: string;
  number?: string;
  title?: string;
  agency?: string;
  agencyCode?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
};

/** Grants.gov returns US-format dates; anything else becomes null rather than a wrong date. */
function parseCloseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const hit = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!hit) return null;
  const [, mm, dd, yyyy] = hit;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Agency codes are dotted hierarchies (HHS-NIH11, USDA-NIFA). The first
 * segment is the department, which is the level the funder directory models.
 */
function departmentOf(agencyCode: string | undefined): string | null {
  if (!agencyCode) return null;
  return agencyCode.split("-")[0] || null;
}

async function fetchPage(startRecordNum: number): Promise<{ hits: OppHit[]; hitCount: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(SEARCH2_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: PAGE_SIZE,
        startRecordNum,
        keyword: "",
        oppStatuses: "forecasted|posted",
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`grants_gov_http_${response.status}`);
    const payload = (await response.json()) as {
      errorcode?: number;
      data?: { oppHits?: OppHit[]; hitCount?: number };
    };
    if (payload.errorcode !== 0) throw new Error(`grants_gov_api_error_${payload.errorcode}`);
    return {
      hits: payload.data?.oppHits ?? [],
      hitCount: payload.data?.hitCount ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- collect opportunities -------------------------------------------------
const opportunities: OppHit[] = [];
let start = 0;
let hitCount = Infinity;
while (opportunities.length < MAX && start < hitCount) {
  const { hits, hitCount: total } = await fetchPage(start);
  hitCount = total;
  if (hits.length === 0) break;
  opportunities.push(...hits);
  start += hits.length;
  console.log(`fetched ${opportunities.length}/${Math.min(total, MAX)} opportunities`);
}
const usable = opportunities.filter((o) => o.title && o.agency).slice(0, MAX);
console.log(`usable opportunities: ${usable.length} (of ${hitCount} reported open)`);

// --- resolve funders -------------------------------------------------------
const agencies = new Map<string, { name: string; code: string | null }>();
for (const opp of usable) {
  if (!opp.agency) continue;
  if (!agencies.has(opp.agency)) {
    agencies.set(opp.agency, { name: opp.agency, code: opp.agencyCode ?? null });
  }
}
console.log(`distinct issuing agencies: ${agencies.size}`);

const { data: existingFunders, error: funderReadError } = await supabase
  .from("funders")
  .select("id, name")
  .eq("country", "US");
if (funderReadError) throw new Error(funderReadError.message);

const funderIdByName = new Map<string, string>(
  (existingFunders ?? []).map((f) => [f.name.toLowerCase(), f.id]),
);

const newFunders = [...agencies.values()]
  .filter((a) => !funderIdByName.has(a.name.toLowerCase()))
  .map((a) => ({
    name: a.name,
    country: "US",
    jurisdiction: departmentOf(a.code) ? `US-${departmentOf(a.code)}` : "US-Federal",
    category: "US Federal Agency",
    source_type: "api",
    source_url: SEARCH2_URL,
    website: a.code
      ? `https://www.grants.gov/search-grants?agencies=${encodeURIComponent(a.code)}`
      : "https://www.grants.gov",
    active: true,
  }));

if (DRY_RUN) {
  console.log(`[dry-run] would create ${newFunders.length} funders`);
} else if (newFunders.length) {
  const { data: inserted, error } = await supabase
    .from("funders")
    .upsert(newFunders, { onConflict: "name,country" })
    .select("id, name");
  if (error) throw new Error(`funder upsert failed: ${error.message}`);
  for (const f of inserted ?? []) funderIdByName.set(f.name.toLowerCase(), f.id);
  console.log(`funders created/updated: ${inserted?.length ?? 0}`);
}

// --- build grant rows ------------------------------------------------------
const rows = [];
let unlinked = 0;
for (const opp of usable) {
  const funderId = funderIdByName.get((opp.agency ?? "").toLowerCase());
  if (!funderId) {
    unlinked++;
    continue;
  }
  const ref = opp.number || opp.id;
  rows.push({
    funder_id: funderId,
    title: opp.title!.slice(0, 500),
    url: opp.id
      ? `https://www.grants.gov/search-results-detail/${opp.id}`
      : "https://www.grants.gov",
    // Stable across re-runs so repeated imports update rather than duplicate.
    source_hash: createHash("sha256").update(`grants_gov:${ref}`).digest("hex"),
    deadline: parseCloseDate(opp.closeDate),
    country: "US",
    currency: "USD",
    language: "en",
    status: "discovered" as const,
  });
}
if (unlinked) console.log(`skipped (no funder resolved): ${unlinked}`);

if (DRY_RUN) {
  console.log(`[dry-run] would upsert ${rows.length} grants`);
  process.exit(0);
}

let written = 0;
for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100);
  const { data, error } = await supabase
    .from("grants")
    .upsert(chunk, { onConflict: "source_hash", ignoreDuplicates: false })
    .select("id");
  if (error) {
    console.error(`chunk ${i} failed: ${error.message}`);
    continue;
  }
  written += data?.length ?? 0;
}
console.log(`grants upserted: ${written}`);
