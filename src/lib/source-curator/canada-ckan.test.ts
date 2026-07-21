import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCkanRecords } from "./canada-ckan.server";

afterEach(() => vi.unstubAllGlobals());

describe("fetchCkanRecords", () => {
  it("pages current datastore_search results and applies acceptance rules", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, result: { records: [{ id: 1 }, { id: 2 }] } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: { records: [{ id: 3 }] } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchCkanRecords<{ id: number }>({
      resourceId: "resource",
      fields: ["id"],
      filters: { kind: "grant" },
      pageSize: 2,
      maxRows: 10,
      accept: (row) => row.id !== 2,
    });

    expect(rows).toEqual([{ id: 1 }, { id: 3 }]);
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondUrl.pathname).toContain("datastore_search");
    expect(secondUrl.searchParams.get("offset")).toBe("2");
    expect(secondUrl.searchParams.get("filters")).toBe('{"kind":"grant"}');
  });

  it("fails honestly when CKAN rejects a request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false, error: { message: "Bad resource id" } })),
        ),
    );
    await expect(fetchCkanRecords({ resourceId: "retired", maxRows: 1 })).rejects.toThrow(
      "ckan_datastore_error:Bad resource id",
    );
  });

  it("surfaces HTTP failures instead of converting them to empty results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    await expect(fetchCkanRecords({ resourceId: "missing", maxRows: 1 })).rejects.toThrow(
      "ckan_datastore_404",
    );
  });
});
