/**
 * Competitive Intelligence Importer
 *
 * Imports Canadian government grants data from Open Government Portal.
 * Source: TBS Proactive Disclosure — Grants & Contributions
 *
 * Usage: bun run scripts/import-competitive-intel.ts [--dry-run] [--limit=N]
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:15435";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const DATA_DIR = join(import.meta.dir, "../data/competitive-intel");

// CKAN Datastore API for TBS Proactive Disclosure
const CKAN_API = "https://open.canada.ca/data/en/api/3/action/datastore_search";
const RESOURCE_ID = "1d15a62f-5656-49ad-8c88-f40ce689d831";

const FLAGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface CompetitiveRecord {
  external_id: string;
  recipient_name: string;
  recipient_legal_name: string | null;
  recipient_type: string | null;
  recipient_province: string | null;
  recipient_city: string | null;
  program_name: string | null;
  agreement_title: string | null;
  agreement_value: number | null;
  agreement_start_date: string | null;
  agreement_end_date: string | null;
  agreement_type: string | null;
  description: string | null;
  naics_code: string | null;
  department: string | null;
  data_source: string;
  data_year: number;
}

/**
 * Fetch records from CKAN API with pagination
 */
async function fetchFromCKAN(offset: number, limit: number): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    resource_id: RESOURCE_ID,
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${CKAN_API}?${params}`);
  if (!res.ok) throw new Error(`CKAN API error: ${res.status}`);
  const json = await res.json();
  return json.result?.records || [];
}

/**
 * Transform CKAN record to our schema
 */
function transformRecord(row: Record<string, unknown>): CompetitiveRecord {
  const value = row.agreement_value ? Number(row.agreement_value) : null;
  return {
    external_id: String(row.ref_number || ""),
    recipient_name: String(row.recipient_operating_name || row.recipient_legal_name || ""),
    recipient_legal_name: row.recipient_legal_name ? String(row.recipient_legal_name) : null,
    recipient_type: row.recipient_type ? String(row.recipient_type) : null,
    recipient_province: row.recipient_province ? String(row.recipient_province) : null,
    recipient_city: row.recipient_city ? String(row.recipient_city) : null,
    program_name: row.prog_name_en ? String(row.prog_name_en) : null,
    agreement_title: row.agreement_title_en ? String(row.agreement_title_en) : null,
    agreement_value: value && !isNaN(value) ? value : null,
    agreement_start_date: row.agreement_start_date ? String(row.agreement_start_date) : null,
    agreement_end_date: row.agreement_end_date ? String(row.agreement_end_date) : null,
    agreement_type: row.agreement_type ? String(row.agreement_type) : null,
    description: row.description_en ? String(row.description_en).slice(0, 2000) : null,
    naics_code: row.naics_identifier ? String(row.naics_identifier) : null,
    department: row.owner_org_title ? String(row.owner_org_title) : null,
    data_source: "tbs_proactive_disclosure",
    data_year: 2025,
  };
}

/**
 * Upsert competitive records to Supabase
 */
async function upsertRecords(records: CompetitiveRecord[], dryRun: boolean) {
  if (dryRun) {
    console.log(`  [dry-run] Would upsert ${records.length} records`);
    return;
  }

  const BATCH_SIZE = 500;
  let upserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE).map((r) => ({
      ...r,
      updated_at: new Date().toISOString(),
    }));

    const { error, count } = await supabase
      .from("competitive_grants")
      .upsert(batch, { onConflict: "external_id", count: "exact" });

    if (error) {
      console.error(`  [error] Batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      upserted += count || batch.length;
      process.stdout.write(`  [upsert] ${upserted}/${records.length}\r`);
    }
  }
  console.log(`\n  [done] ${upserted} records upserted`);
}

/**
 * Analyze competitive landscape
 */
async function analyzeCompetition(records: CompetitiveRecord[]) {
  const byRecipient: Record<string, { count: number; totalValue: number }> = {};
  const byProgram: Record<string, { count: number; totalValue: number }> = {};
  const byProvince: Record<string, { count: number; totalValue: number }> = {};

  for (const r of records) {
    const name = r.recipient_name || "Unknown";
    if (!byRecipient[name]) byRecipient[name] = { count: 0, totalValue: 0 };
    byRecipient[name].count++;
    byRecipient[name].totalValue += r.agreement_value || 0;

    const prog = r.program_name || "Unknown";
    if (!byProgram[prog]) byProgram[prog] = { count: 0, totalValue: 0 };
    byProgram[prog].count++;
    byProgram[prog].totalValue += r.agreement_value || 0;

    const prov = r.recipient_province || "Unknown";
    if (!byProvince[prov]) byProvince[prov] = { count: 0, totalValue: 0 };
    byProvince[prov].count++;
    byProvince[prov].totalValue += r.agreement_value || 0;
  }

  const topRecipients = Object.entries(byRecipient)
    .sort(([, a], [, b]) => b.totalValue - a.totalValue)
    .slice(0, 20)
    .map(([name, data]) => ({ name, ...data }));

  const topPrograms = Object.entries(byProgram)
    .sort(([, a], [, b]) => b.totalValue - a.totalValue)
    .slice(0, 20)
    .map(([name, data]) => ({ name, ...data }));

  return { topRecipients, topPrograms, byProvince };
}

async function main() {
  console.log("=== Competitive Intelligence Importer ===\n");

  const dryRun = !!FLAGS["dry-run"];
  const limit = FLAGS.limit ? Number(FLAGS.limit) : 1000;
  if (dryRun) console.log("  [mode] DRY RUN\n");

  // 1. Fetch from CKAN API
  console.log(`1. Fetching records from CKAN API (limit: ${limit})...`);
  const allRecords: Record<string, unknown>[] = [];
  const PAGE_SIZE = 100;

  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const batch = await fetchFromCKAN(offset, Math.min(PAGE_SIZE, limit - offset));
    allRecords.push(...batch);
    process.stdout.write(`  [fetch] ${allRecords.length}/${limit}\r`);
    if (batch.length < PAGE_SIZE) break;
  }
  console.log(`\n  [done] ${allRecords.length} records fetched`);

  // 2. Transform records
  console.log("\n2. Transforming records...");
  const competitiveRecords = allRecords.map(transformRecord);
  console.log(`  [transform] ${competitiveRecords.length} records transformed`);

  // 3. Analyze competition
  console.log("\n3. Analyzing competitive landscape...");
  const analysis = await analyzeCompetition(competitiveRecords);
  console.log(
    `  [analysis] Top recipient: ${analysis.topRecipients[0]?.name} ($${analysis.topRecipients[0]?.totalValue.toLocaleString()})`,
  );

  // 4. Upsert to Supabase
  console.log("\n4. Upserting to Supabase...");
  await upsertRecords(competitiveRecords, dryRun);

  console.log("\n=== Import complete ===");
}

main().catch(console.error);
