import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGrantsGovAgencies } from "./grants-gov.server";

const okBody = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("fetchGrantsGovAgencies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes multiple opportunities from the same agency into one candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okBody({
          errorcode: 0,
          data: {
            oppHits: [
              {
                id: "1",
                number: "PAR-25-274",
                title: "Clinical Trials A",
                agencyCode: "HHS-NIH11",
                agency: "National Institutes of Health",
                oppStatus: "posted",
              },
              {
                id: "2",
                number: "PAR-25-268",
                title: "Clinical Trials B",
                agencyCode: "HHS-NIH11",
                agency: "National Institutes of Health",
                oppStatus: "posted",
              },
              {
                id: "3",
                number: "P12AC10113",
                title: "Vegetation Interns",
                agencyCode: "DOI-NPS",
                agency: "National Park Service",
                oppStatus: "posted",
              },
            ],
          },
        }),
      ),
    );

    const candidates = await fetchGrantsGovAgencies(50);
    expect(candidates).toHaveLength(2);
    const nih = candidates.find((c) => c.name === "National Institutes of Health");
    expect(nih?.funder_type).toBe("US Federal");
    expect(nih?.source_signals).toContain("grants_gov");
    expect(nih?.website).toContain("HHS-NIH11");
  });

  it("throws (not silently empty) when the API returns a non-zero errorcode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okBody({ errorcode: 1, msg: "bad request" })),
    );
    await expect(fetchGrantsGovAgencies()).rejects.toThrow("grants_gov_api_error_1");
  });

  it("throws on a non-JSON / HTML response instead of returning zero candidates silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!DOCTYPE html><html>...</html>", { status: 200 })),
    );
    await expect(fetchGrantsGovAgencies()).rejects.toThrow();
  });
});
