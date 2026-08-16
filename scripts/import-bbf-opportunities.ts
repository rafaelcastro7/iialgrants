/**
 * Canadian opportunity importer — Innovation Canada's Business Benefits Finder.
 *
 * src/lib/source-curator/bbf-programs.server.ts already downloads this workbook,
 * but collapses it to one RawCandidate per organization and keeps at most five
 * program titles as sample metadata — the other ~1600 program rows are
 * discarded. Those rows *are* the Canadian funding opportunities, complete with
 * bilingual titles and descriptions, so this imports them as grants linked to
 * their administering organization.
 *
 * Pairs with scripts/import-grants-gov-opportunities.ts (US federal side).
 *
 * Source: https://open.canada.ca/data/en/dataset/4e75337e-70d0-4ed7-92d1-3b85192ec6b1
 * Usage: bun run scripts/import-bbf-opportunities.ts [--dry-run] [--limit=N]
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import ExcelJS from "exceljs";
import {
  findLatestWorkbook,
  cellText,
  specificOrganization,
} from "../src/lib/source-curator/bbf-programs.server";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:15435";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

const FLAGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DRY_RUN = Boolean(FLAGS["dry-run"]);
const MAX = FLAGS.limit ? Number(FLAGS.limit) : Infinity;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * The workbook lists Canadian *programs*, but a handful are administered by
 * foreign or multilateral bodies under bilateral agreements (the European
 * Commission runs Horizon Europe co-funding, for example). Tagging those as
 * Canadian puts them under the wrong flag in the directory.
 */
const INTERNATIONAL_ADMINISTRATORS: Array<[RegExp, { country: string; jurisdiction: string }]> = [
  [/^european commission|^european union\b/i, { country: "INTL", jurisdiction: "European Union" }],
  [/^united nations|^unesco\b|^unicef\b/i, { country: "INTL", jurisdiction: "United Nations" }],
  [/^world bank|^international monetary fund/i, { country: "INTL", jurisdiction: "Multilateral" }],
  [/^inter-american development bank|^\bidb\b/i, { country: "INTL", jurisdiction: "Pan-American" }],
  [/^organisation for economic|^oecd\b/i, { country: "INTL", jurisdiction: "Multilateral" }],
];

function originOf(organization: string, rawOrganization: string) {
  for (const [pattern, origin] of INTERNATIONAL_ADMINISTRATORS) {
    if (pattern.test(organization)) return origin;
  }
  return { country: "CA", jurisdiction: jurisdictionOf(rawOrganization) };
}

/** Province is encoded in the government prefix, which specificOrganization strips. */
function jurisdictionOf(rawOrganization: string): string {
  const table: Array<[RegExp, string]> = [
    [/government of canada|gouvernement du canada/i, "CA-Federal"],
    [/government of ontario|gouvernement de l['’]ontario/i, "CA-ON"],
    [/government of quebec|gouvernement du qu[ée]bec/i, "CA-QC"],
    [/government of alberta/i, "CA-AB"],
    [/government of british columbia/i, "CA-BC"],
    [/government of manitoba/i, "CA-MB"],
    [/government of saskatchewan/i, "CA-SK"],
    [/government of nova scotia/i, "CA-NS"],
    [/government of new brunswick/i, "CA-NB"],
    [/government of newfoundland and labrador/i, "CA-NL"],
    [/government of prince edward island/i, "CA-PE"],
  ];
  for (const [pattern, code] of table) if (pattern.test(rawOrganization)) return code;
  return "CA";
}

const workbookUrl = await findLatestWorkbook();
console.log(`workbook: ${workbookUrl}`);
const response = await fetch(workbookUrl);
if (!response.ok) throw new Error(`bbf_xlsx_http_${response.status}`);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await response.arrayBuffer());
const sheet = workbook.worksheets[0];
if (!sheet || sheet.rowCount < 3) throw new Error("bbf_xlsx_invalid_sheet");

const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) =>
  cellText(v).toLowerCase(),
);
const indexOf = (pattern: RegExp) => header.findIndex((v) => pattern.test(String(v ?? "")));
const columns = {
  title: indexOf(/^title\s*-\s*english$/),
  titleFr: indexOf(/^title\s*-\s*french$/),
  shortEn: indexOf(/^short description\s*-\s*english$/),
  shortFr: indexOf(/^short description\s*-\s*french$/),
  longEn: indexOf(/^long description\s*-\s*english$/),
  org: indexOf(/^organization\s*-\s*english$/),
  orgFr: indexOf(/^organization\s*-\s*french$/),
  url: indexOf(/^organization url\s*-\s*english$/),
};
if (columns.title < 1 || columns.org < 1 || columns.url < 1) {
  throw new Error("bbf_xlsx_required_columns_missing");
}

type Program = {
  title: string;
  titleFr: string | null;
  summary: string | null;
  summaryFr: string | null;
  organization: string;
  organizationFr: string | null;
  country: string;
  jurisdiction: string;
  url: string;
};

const programs: Program[] = [];
for (let rowNumber = 3; rowNumber <= sheet.rowCount && programs.length < MAX; rowNumber++) {
  const values = sheet.getRow(rowNumber).values as ExcelJS.CellValue[];
  const title = cellText(values[columns.title]);
  const rawOrganization = cellText(values[columns.org]);
  const organization = specificOrganization(rawOrganization);
  const url = cellText(values[columns.url]);
  if (title.length < 3 || organization.length < 3 || !url.startsWith("http")) continue;

  const organizationFr = specificOrganization(cellText(values[columns.orgFr]));
  const shortEn = cellText(values[columns.shortEn]);
  const longEn = cellText(values[columns.longEn]);
  programs.push({
    title,
    titleFr: cellText(values[columns.titleFr]) || null,
    // Prefer the long description; it carries the eligibility language that
    // makes semantic search useful, and falls back to the one-line teaser.
    summary: longEn || shortEn || null,
    summaryFr: cellText(values[columns.shortFr]) || null,
    organization,
    organizationFr: organizationFr && organizationFr !== organization ? organizationFr : null,
    ...originOf(organization, rawOrganization),
    url,
  });
}
console.log(`programs parsed: ${programs.length}`);

// --- resolve funders -------------------------------------------------------
// Match against the whole directory, not just country=CA: an organization the
// workbook lists may already exist under US/INTL, and scoping the lookup to CA
// would create a second, wrongly-flagged copy of it.
const { data: existingFunders, error: funderReadError } = await supabase
  .from("funders")
  .select("id, name");
if (funderReadError) throw new Error(funderReadError.message);
const funderIdByName = new Map<string, string>(
  (existingFunders ?? []).map((f) => [f.name.toLowerCase(), f.id]),
);

const seen = new Set<string>();
const newFunders = [];
for (const p of programs) {
  const key = p.organization.toLowerCase();
  if (funderIdByName.has(key) || seen.has(key)) continue;
  seen.add(key);
  newFunders.push({
    name: p.organization,
    name_fr: p.organizationFr,
    country: p.country,
    jurisdiction: p.jurisdiction,
    category:
      p.country === "CA" ? "Canadian Funding Program Administrator" : "International Administrator",
    // funder_source_type enum is (rss, api, html, manual); the workbook is
    // fetched through open.canada.ca's CKAN API.
    source_type: "api",
    source_url: workbookUrl,
    website: p.url,
    active: true,
  });
}

if (DRY_RUN) {
  console.log(`[dry-run] would create ${newFunders.length} funders`);
} else if (newFunders.length) {
  for (let i = 0; i < newFunders.length; i += 100) {
    const { data, error } = await supabase
      .from("funders")
      .upsert(newFunders.slice(i, i + 100), { onConflict: "name,country" })
      .select("id, name");
    if (error) throw new Error(`funder upsert failed: ${error.message}`);
    for (const f of data ?? []) funderIdByName.set(f.name.toLowerCase(), f.id);
  }
  console.log(`funders created/updated: ${newFunders.length}`);
}

// --- build grant rows ------------------------------------------------------
const rows = [];
let unlinked = 0;
for (const p of programs) {
  const funderId = funderIdByName.get(p.organization.toLowerCase());
  if (!funderId) {
    unlinked++;
    continue;
  }
  rows.push({
    funder_id: funderId,
    title: p.title.slice(0, 500),
    title_fr: p.titleFr?.slice(0, 500) ?? null,
    summary: p.summary?.slice(0, 4000) ?? null,
    summary_fr: p.summaryFr?.slice(0, 4000) ?? null,
    url: p.url,
    source_hash: createHash("sha256").update(`bbf:${p.organization}:${p.title}`).digest("hex"),
    // The grant stays CA even when the administrator is international: these
    // are programs open to Canadian applicants. Only the funder carries the
    // administering body's own country.
    country: "CA",
    currency: "CAD",
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
  const { data, error } = await supabase
    .from("grants")
    .upsert(rows.slice(i, i + 100), { onConflict: "source_hash", ignoreDuplicates: false })
    .select("id");
  if (error) {
    console.error(`chunk ${i} failed: ${error.message}`);
    continue;
  }
  written += data?.length ?? 0;
}
console.log(`grants upserted: ${written}`);
