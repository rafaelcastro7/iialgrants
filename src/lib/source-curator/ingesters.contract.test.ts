import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAlbertaGrants } from "./alberta-ckan.server";
import { fetchBbfPrograms } from "./bbf-programs.server";
import { fetchEuCalls } from "./eu-ft.server";
import { fetchOtfRecipients } from "./otf.server";
import { extractT3010Candidates } from "./t3010.server";

afterEach(() => vi.unstubAllGlobals());

describe("source ingester contracts", () => {
  it("uses EU POST search and retains only current English calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              language: "en",
              url: "https://ec.europa.eu/current",
              metadata: {
                title: ["Canada collaboration call"],
                frameworkProgramme: ["43108390"],
                deadlineDate: ["2099-09-10T14:00:00.000Z"],
              },
            },
            {
              language: "fr",
              url: "https://ec.europa.eu/fr",
              metadata: { frameworkProgramme: ["43108390"] },
            },
            {
              language: "en",
              url: "https://ec.europa.eu/expired",
              metadata: {
                frameworkProgramme: ["43108390"],
                deadlineDate: ["2020-01-01T00:00:00.000Z"],
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchEuCalls();
    expect(result.map((candidate) => candidate.name)).toEqual([
      "European Commission — Horizon Europe",
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });

  it("parses the official BBF XLSX and identifies the specific issuing organization", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("IC_Programs_and_Services");
    sheet.addRow([
      "Title  - English",
      "Title - French",
      "Short Description - English",
      "Short Description - French",
      "Long Description - English",
      "Long Description - French",
      "Organization - English",
      "Organization - French",
      "Organization URL - English",
      "Organization URL - French",
    ]);
    sheet.addRow(["translated headers"]);
    sheet.addRow([
      "Alliance grants",
      "Subventions Alliance",
      "",
      "",
      "",
      "",
      "Government of Canada, Innovation, Science and Economic Development Canada",
      "Gouvernement du Canada, Innovation, Sciences et Développement économique Canada",
      "https://www.nserc-crsng.gc.ca/",
      "https://www.nserc-crsng.gc.ca/fra.asp",
    ]);
    const workbookBytes = await workbook.xlsx.writeBuffer();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              resources: [
                {
                  format: "XLSX",
                  name: "2025 July",
                  last_modified: "2025-07-17",
                  url: "https://official.example/bbf.xlsx",
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(workbookBytes));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBbfPrograms();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Innovation, Science and Economic Development Canada",
      website: "https://www.nserc-crsng.gc.ca/",
    });
  });

  it("uses current OTF columns and rejects generic community recipients", async () => {
    const csv = [
      "Organization name:Nom d'organisme,Amount Awarded:Montant décerné",
      '"Toronto Community Foundation","$150,000"',
      '"Community Living Toronto","$500,000"',
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(csv)));
    const result = await fetchOtfRecipients();
    expect(result.map((candidate) => candidate.name)).toEqual(["Toronto Community Foundation"]);
  });

  it("labels T3010 financial evidence as gifts to qualified donees", () => {
    const [candidate] = extractT3010Candidates([
      {
        charity_name: "Verified Foundation",
        bn_registration_number: "123456789RR0001",
        province: "ON",
        total_expenditures: 750_000,
      },
    ]);
    expect(candidate.disbursed_annual).toBe(750_000);
    expect(candidate.raw_metadata?.financial_metric).toBe(
      "T3010_line_5050_gifts_to_qualified_donees",
    );
  });

  it("surfaces upstream HTTP failures rather than returning a successful empty run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gone", { status: 400 })));
    await expect(fetchAlbertaGrants()).rejects.toThrow("alberta_ckan_http_400");
    await expect(fetchOtfRecipients()).rejects.toThrow("otf_csv_http_400");
  });
});
