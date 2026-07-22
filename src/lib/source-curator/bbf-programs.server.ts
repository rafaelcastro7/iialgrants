// Business Benefits Finder (Innovation Canada). The official package currently
// publishes XLSX only, so parse the newest workbook instead of silently looking
// for a CSV resource that does not exist.

import ExcelJS from "exceljs";
import type { RawCandidate } from "./scoring.server";

const PACKAGE_URL =
  "https://open.canada.ca/data/api/3/action/package_show?id=4e75337e-70d0-4ed7-92d1-3b85192ec6b1";

type CkanResource = { url?: string; format?: string; name?: string; last_modified?: string | null };

async function findLatestWorkbook(): Promise<string> {
  const response = await fetch(PACKAGE_URL);
  if (!response.ok) throw new Error(`bbf_package_http_${response.status}`);
  const payload = (await response.json()) as {
    success?: boolean;
    result?: { resources?: CkanResource[] };
  };
  if (payload.success !== true) throw new Error("bbf_package_invalid_response");
  const workbooks = (payload.result?.resources ?? []).filter(
    (resource) => resource.url && /xlsx/i.test(resource.format ?? ""),
  );
  const latest = workbooks
    .sort((a, b) =>
      String(a.last_modified ?? a.name ?? "").localeCompare(
        String(b.last_modified ?? b.name ?? ""),
      ),
    )
    .at(-1);
  if (!latest?.url) throw new Error("bbf_xlsx_resource_missing");
  return latest.url;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  return String(value).trim();
}

function specificOrganization(value: string): string {
  return value
    .trim()
    .replace(
      /^(?:government of (?:canada|alberta|british columbia|manitoba|new brunswick|newfoundland and labrador|nova scotia|ontario|prince edward island|quebec|saskatchewan)|gouvernement du canada|gouvernement de l['’]ontario|gouvernement du québec),\s*/i,
      "",
    );
}

// Broader than the prefix `specificOrganization` strips (that one only covers
// Canada/Ontario/Québec on the French side, for historical reasons — kept as-is
// to avoid changing existing candidate names). This one recognizes a
// government-of-X prefix for every province/territory in either language,
// purely to decide `funder_type`, and matches regardless of what follows.
const GOVERNMENT_AFFILIATION =
  /^(?:government of (?:canada|alberta|british columbia|manitoba|new brunswick|newfoundland and labrador|nova scotia|ontario|prince edward island|quebec|saskatchewan)|gouvernement du (?:canada|qu[ée]bec|nouveau-brunswick|manitoba|yukon|nunavut)|gouvernement de (?:l['’]ontario|la nouvelle-[ée]cosse|l['’][iî]le-du-prince-[ée]douard|la colombie-britannique|terre-neuve-et-labrador)|gouvernement des territoires du nord-ouest)\b/i;

/**
 * The BBF workbook's "Organization - English" column is not exclusively
 * government departments — roughly 65% of unique values have no government
 * prefix and are hospitals, universities, foundations, or private
 * administrators (e.g. "Cognit.ca | Hospital for Sick Children" — Cognit.ca
 * is a private research-grants platform the source spreadsheet uses to list
 * programs on behalf of the institution named after the pipe). Classify from
 * the raw (unstripped) organization string, since `specificOrganization`
 * already strips the government prefix off by the time `name` is built.
 */
function classifyFunderType(rawOrganization: string): string {
  if (GOVERNMENT_AFFILIATION.test(rawOrganization.trim())) return "Government program";

  const pipeIndex = rawOrganization.indexOf("|");
  const segment = pipeIndex >= 0 ? rawOrganization.slice(pipeIndex + 1).trim() : rawOrganization;

  if (
    /\b(hospital|health (?:sciences|network|care|services)|medical cent(?:er|re)|cancer (?:agency|centre|center)|research institute|institut de recherche|centre hospitalier|sant[ée] mentale)\b/i.test(
      segment,
    )
  ) {
    return "Hospital / Research Institute";
  }
  if (
    /\b(universit[ée]|college|coll[èe]ge|c[ée]gep|polytechnique|institute of technology)\b/i.test(
      segment,
    )
  ) {
    return "University / College";
  }
  if (/\b(foundation|fondation)\b/i.test(segment)) return "Foundation";
  if (
    /\b(inc\.?|ltd\.?|limited|llc)\b/i.test(segment) ||
    /^[a-z0-9][\w-]*\.(?:ca|com|org|net)\b/i.test(segment)
  ) {
    return "Private / Other";
  }
  return "Community / Re-grant";
}

export async function fetchBbfPrograms(): Promise<RawCandidate[]> {
  const workbookUrl = await findLatestWorkbook();
  const response = await fetch(workbookUrl);
  if (!response.ok) throw new Error(`bbf_xlsx_http_${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1_000) throw new Error("bbf_xlsx_too_short");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 3) throw new Error("bbf_xlsx_invalid_sheet");

  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((value) =>
    cellText(value).toLowerCase(),
  );
  const indexOf = (pattern: RegExp) =>
    header.findIndex((value) => pattern.test(String(value ?? "")));
  const columns = {
    title: indexOf(/^title\s*-\s*english$/),
    org: indexOf(/^organization\s*-\s*english$/),
    orgFr: indexOf(/^organization\s*-\s*french$/),
    url: indexOf(/^organization url\s*-\s*english$/),
  };
  if (columns.title < 1 || columns.org < 1 || columns.url < 1) {
    throw new Error("bbf_xlsx_required_columns_missing");
  }

  const candidates = new Map<string, RawCandidate>();
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber++) {
    const values = sheet.getRow(rowNumber).values as ExcelJS.CellValue[];
    const rawOrganization = cellText(values[columns.org]);
    const organization = specificOrganization(rawOrganization);
    if (organization.length < 3) continue;
    const key = organization.toLowerCase();
    const title = cellText(values[columns.title]);
    const existing = candidates.get(key);
    if (existing) {
      const metadata = existing.raw_metadata as {
        sample_programs?: string[];
        program_count?: number;
      };
      metadata.program_count = (metadata.program_count ?? 1) + 1;
      if (title) {
        metadata.sample_programs = [...(metadata.sample_programs ?? []), title].slice(0, 5);
      }
      continue;
    }
    const organizationFr = specificOrganization(cellText(values[columns.orgFr]));
    const url = cellText(values[columns.url]);
    candidates.set(key, {
      name: organization,
      name_fr: organizationFr && organizationFr !== organization ? organizationFr : null,
      funder_type: classifyFunderType(rawOrganization),
      website: url.startsWith("http") ? url : null,
      source_signals: ["bbf_programs"],
      raw_metadata: {
        sample_programs: title ? [title] : [],
        program_count: 1,
        workbook_url: workbookUrl,
      },
    });
  }
  return [...candidates.values()].slice(0, 800);
}
