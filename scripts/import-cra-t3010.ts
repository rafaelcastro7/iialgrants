/**
 * CRA T3010 Registered Charity Importer
 *
 * Downloads and imports Canadian charity data from Open Government Portal.
 * Source: https://open.canada.ca/data/en/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6
 *
 * Usage: bun run scripts/import-cra-t3010.ts [--dry-run] [--limit=N] [--force]
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:15435";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const DATA_DIR = join(import.meta.dir, "../data/cra-t3010");

const CSV_URLS = {
  ident:
    "https://open.canada.ca/data/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6/resource/31a52caf-fa79-4ab3-bded-1ccc7b61c17f/download/ident_2023_updated.csv",
  general:
    "https://open.canada.ca/data/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6/resource/4cf7d8fa-221a-4934-a423-82dbeac7462b/download/financial_section_a_b_and_c_2023_updated.csv",
  weburl:
    "https://open.canada.ca/data/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6/resource/204222a0-eefc-4ccc-8c29-b6ecea0f6eb5/download/weburl_2023_updated.csv",
  directors:
    "https://open.canada.ca/data/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6/resource/798a4a5f-f1ac-41a1-82d7-ef777f905bfe/download/directors_2023_updated.csv",
  programs:
    "https://open.canada.ca/data/dataset/05b3abd0-e70f-4b3b-a9c5-acc436bd15b6/resource/b02f94b3-6555-4315-96ab-2658f61290c5/download/new_ongoing_programs_2023_updated.csv",
};

const FLAGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function downloadCSV(name: keyof typeof CSV_URLS): Promise<string> {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const dest = join(DATA_DIR, `${name}.csv`);
  if (existsSync(dest) && !FLAGS.force) {
    console.log(`  [skip] ${name}.csv already exists`);
    return dest;
  }
  console.log(`  [download] ${name}.csv ...`);
  const res = await fetch(CSV_URLS[name]);
  if (!res.ok) throw new Error(`Failed to download ${name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`  [done] ${name}.csv (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  return dest;
}

function parseCSV(filePath: string): Record<string, string>[] {
  const content = readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

function normalizeBN(bn: string): string {
  return bn?.trim() || "";
}

function getField(row: Record<string, string>, ...candidates: string[]): string | null {
  for (const c of candidates) {
    const v = row[c];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

interface FunderRecord {
  external_id: string;
  name: string;
  legal_name: string | null;
  designation: string | null;
  category: string | null;
  charity_status: string | null;
  effective_date: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  telephone: string | null;
  email: string | null;
  website: string | null;
  language: string | null;
  accounting_period_end: string | null;
  data_source: string;
  data_year: number;
}

async function importIdentities(
  records: Record<string, string>[],
  _dryRun: boolean,
): Promise<Map<string, FunderRecord>> {
  const funders = new Map<string, FunderRecord>();
  let count = 0;
  const limit = FLAGS.limit ? Number(FLAGS.limit) : Infinity;

  for (const row of records) {
    if (count >= limit) break;
    // Actual CSV header: "BN"
    const bn = normalizeBN(
      getField(row, "BN", "BN/Registration number", "BN/Registration Number") || "",
    );
    if (!bn) continue;

    funders.set(bn, {
      external_id: bn,
      // Actual CSV headers: "Account Name", "Legal Name"
      name: getField(row, "Account Name", "Charity name", "Legal Name") || "",
      legal_name: getField(row, "Legal Name"),
      designation: getField(row, "Designation"),
      category: getField(row, "Category"),
      charity_status: getField(row, "Charity status", "Status"),
      effective_date: getField(row, "Effective date of status"),
      address: getField(row, "Address Line 1", "Address"),
      city: getField(row, "City"),
      province: getField(row, "Province"),
      postal_code: getField(row, "Postal Code", "Postal code"),
      telephone: getField(row, "Telephone"),
      email: getField(row, "Email address", "Email"),
      website: null,
      language: getField(row, "Language of correspondence", "Language"),
      accounting_period_end: getField(row, "Accounting period end date", "FPE"),
      data_source: "cra_t3010_2023",
      data_year: 2023,
    });
    count++;
  }

  console.log(`  [ident] ${funders.size} charities parsed`);
  return funders;
}

async function enrichWithWebsites(
  funders: Map<string, FunderRecord>,
  records: Record<string, string>[],
) {
  let enriched = 0;
  for (const row of records) {
    // weburl CSV header: "BN/NE"
    const bn = normalizeBN(getField(row, "BN/NE", "BN/Registration number", "BN") || "");
    const funder = funders.get(bn);
    if (!funder) continue;

    // weburl CSV header: "Contact URL"
    const url = getField(row, "Contact URL", "Web URL", "URL");
    if (url) {
      funder.website = url.startsWith("http") ? url : `https://${url}`;
      enriched++;
    }
  }
  console.log(`  [weburl] ${enriched} funders enriched with websites`);
}

async function upsertFunders(funders: FunderRecord[], dryRun: boolean) {
  if (dryRun) {
    console.log(`  [dry-run] Would upsert ${funders.length} funders`);
    return;
  }

  const BATCH_SIZE = 500;
  let upserted = 0;

  for (let i = 0; i < funders.length; i += BATCH_SIZE) {
    const batch = funders.slice(i, i + BATCH_SIZE).map((f) => ({
      ...f,
      updated_at: new Date().toISOString(),
    }));

    const { error, count } = await supabase
      .from("funders")
      .upsert(batch, { onConflict: "external_id", count: "exact" });

    if (error) {
      console.error(`  [error] Batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      upserted += count || batch.length;
      process.stdout.write(`  [upsert] ${upserted}/${funders.length}\r`);
    }
  }
  console.log(`\n  [done] ${upserted} funders upserted`);
}

async function main() {
  console.log("=== CRA T3010 Charity Importer ===\n");

  const dryRun = !!FLAGS["dry-run"];
  if (dryRun) console.log("  [mode] DRY RUN\n");

  // 1. Download CSVs
  console.log("1. Downloading CSVs...");
  const identPath = await downloadCSV("ident");
  const weburlPath = await downloadCSV("weburl");

  // 2. Parse identification data
  console.log("\n2. Parsing identification data...");
  const identRecords = parseCSV(identPath);
  const funders = await importIdentities(identRecords, dryRun);

  // 3. Enrich with websites
  console.log("\n3. Enriching with websites...");
  const weburlRecords = parseCSV(weburlPath);
  await enrichWithWebsites(funders, weburlRecords);

  // 4. Upsert to Supabase
  console.log("\n4. Upserting to Supabase...");
  await upsertFunders(Array.from(funders.values()), dryRun);

  console.log("\n=== Import complete ===");
}

main().catch(console.error);
