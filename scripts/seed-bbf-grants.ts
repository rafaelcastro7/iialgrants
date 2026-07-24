// The Business Benefits Finder workbook (open.canada.ca dataset
// 4e75337e-70d0-4ed7-92d1-3b85192ec6b1, already used by bbf-programs.server.ts
// to discover FUNDERS) has ~1,617 individual program rows, each carrying its
// own specific title + organization URL + description — not just the
// organization name. bbf-programs.server.ts collapses all of a funder's rows
// down to one funder candidate and discards the rest (kept only as a
// `sample_programs` list, capped at 5). That's exactly why several grants
// discovered by crawling ISED's own site (a Salesforce community hub) ended
// up sharing one generic/broken fallback URL and got archived earlier this
// session — the specific per-program URL was sitting unused in this same
// workbook the whole time.
//
// This script re-reads the workbook and, for every row whose organization
// already matches an existing `funders` row, inserts the row as a grant
// (status: discovered) using the exact same canonical-key + title-word-gated
// URL dedup rules discoverFunderImpl uses, so it composes safely with grants
// already found by crawling instead of duplicating them.
//
// Usage: bun scripts/seed-bbf-grants.ts [--apply] [--limit=500]
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import {
  findLatestWorkbook,
  cellText,
  specificOrganization,
} from "../src/lib/source-curator/bbf-programs.server";
import {
  canonicalKey,
  normalizeTitle,
  isGenericTitle,
  isRootIndex,
  isNonGrantUrl,
} from "../src/agents/discoverer.impl.server";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 500;

async function main() {
  const workbookUrl = await findLatestWorkbook();
  console.log(`Workbook: ${workbookUrl}`);
  const response = await fetch(workbookUrl);
  if (!response.ok) throw new Error(`workbook_http_${response.status}`);
  const bytes = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("no_worksheet");

  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) =>
    cellText(v).toLowerCase(),
  );
  const indexOf = (pattern: RegExp) => header.findIndex((v) => pattern.test(String(v ?? "")));
  const columns = {
    title: indexOf(/^title\s*-\s*english$/),
    shortDesc: indexOf(/^short description\s*-\s*english$/),
    longDesc: indexOf(/^long description\s*-\s*english$/),
    org: indexOf(/^organization\s*-\s*english$/),
    url: indexOf(/^organization url\s*-\s*english$/),
  };
  if (Object.values(columns).some((i) => i < 1)) {
    throw new Error(`required_columns_missing: ${JSON.stringify(columns)}`);
  }

  const { data: funders, error: funderErr } = await supabase.from("funders").select("id, name");
  if (funderErr) throw new Error(funderErr.message);
  const funderByName = new Map((funders ?? []).map((f) => [f.name.trim().toLowerCase(), f.id]));

  let scanned = 0;
  let noFunderMatch = 0;
  let filteredOut = 0;
  let alreadyExists = 0;
  const toInsert: {
    funderId: string;
    funderName: string;
    title: string;
    summary: string | null;
    grantUrl: string;
  }[] = [];

  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber++) {
    const values = sheet.getRow(rowNumber).values as ExcelJS.CellValue[];
    const title = cellText(values[columns.title]);
    const rawOrg = cellText(values[columns.org]);
    const organization = specificOrganization(rawOrg);
    const grantUrl = cellText(values[columns.url]);
    if (!title || organization.length < 3 || !grantUrl.startsWith("http")) continue;
    scanned++;

    if (isGenericTitle(title) || isRootIndex(grantUrl) || isNonGrantUrl(grantUrl)) {
      filteredOut++;
      continue;
    }

    const funderId = funderByName.get(organization.toLowerCase());
    if (!funderId) {
      noFunderMatch++;
      continue;
    }

    const summary =
      cellText(values[columns.shortDesc]) || cellText(values[columns.longDesc]) || null;
    toInsert.push({ funderId, funderName: organization, title, summary, grantUrl });
  }

  console.log(
    `Scanned ${scanned} rows: ${filteredOut} filtered (generic/index/non-grant), ${noFunderMatch} skipped (funder not yet in our table), ${toInsert.length} candidates against known funders.`,
  );

  let inserted = 0;
  for (const cand of toInsert.slice(0, limit)) {
    const ck = canonicalKey(cand.funderId, cand.title, cand.funderName);
    const [{ data: existingByKey }, { data: existingByUrl }] = await Promise.all([
      supabase.from("grants").select("id").eq("canonical_key", ck).maybeSingle(),
      supabase
        .from("grants")
        .select("id, title")
        .eq("funder_id", cand.funderId)
        .eq("url", cand.grantUrl)
        .maybeSingle(),
    ]);
    const urlMatchSharesTitleWord =
      existingByUrl &&
      normalizeTitle((existingByUrl as { title?: string }).title ?? "")
        .split(/\s+/)
        .some((w) => w && normalizeTitle(cand.title).split(/\s+/).includes(w));
    const existing = existingByKey ?? (urlMatchSharesTitleWord ? existingByUrl : null);
    if (existing) {
      alreadyExists++;
      continue;
    }

    inserted++;
    if (apply) {
      const sourceHash = createHash("sha256")
        .update(`${cand.grantUrl}|${cand.title}`)
        .digest("hex");
      const { error: insErr } = await supabase.from("grants").insert({
        funder_id: cand.funderId,
        title: cand.title,
        summary: cand.summary,
        amount_cad_min: null,
        amount_cad_max: null,
        country: "CA",
        currency: "CAD",
        deadline: null,
        eligibility: {},
        sectors: [],
        language: "en",
        url: cand.grantUrl,
        source_hash: sourceHash,
        canonical_key: ck,
        status: "discovered",
      });
      if (insErr && !/duplicate key/i.test(insErr.message)) {
        console.log(`INSERT ERROR "${cand.title}": ${insErr.message}`);
        inserted--;
      }
    }
  }

  console.log(
    `\n${inserted} ${apply ? "inserted" : "would be inserted"}, ${alreadyExists} already exist (canonical_key or url+title-word match).`,
  );
  if (toInsert.length > limit) {
    console.log(
      `Note: ${toInsert.length - limit} more candidates beyond --limit=${limit} were not processed this run.`,
    );
  }
  if (!apply) console.log("Dry run — re-run with --apply to actually write.");
}

main();
