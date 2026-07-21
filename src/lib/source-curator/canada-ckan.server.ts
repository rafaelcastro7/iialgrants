const CKAN_DATASTORE = "https://open.canada.ca/data/api/3/action/datastore_search";

type CkanOptions<T> = {
  resourceId: string;
  fields?: string[];
  filters?: Record<string, string | number | boolean>;
  sort?: string;
  maxRows: number;
  pageSize?: number;
  timeoutMs?: number;
  accept?: (row: T) => boolean;
  stopAfterPage?: (rows: T[]) => boolean;
};

type CkanResponse<T> = {
  success?: boolean;
  error?: { message?: string };
  result?: { records?: T[] };
};

/** Page through a current Canada Open Data resource without the retired SQL action. */
export async function fetchCkanRecords<T>(options: CkanOptions<T>): Promise<T[]> {
  const pageSize = Math.min(options.pageSize ?? 5_000, 5_000);
  const accepted: T[] = [];
  for (let offset = 0; accepted.length < options.maxRows; offset += pageSize) {
    const url = new URL(CKAN_DATASTORE);
    url.searchParams.set("resource_id", options.resourceId);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    if (options.fields?.length) url.searchParams.set("fields", options.fields.join(","));
    if (options.filters) url.searchParams.set("filters", JSON.stringify(options.filters));
    if (options.sort) url.searchParams.set("sort", options.sort);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`ckan_datastore_${response.status}`);
      const payload = (await response.json()) as CkanResponse<T>;
      if (payload.success !== true) {
        throw new Error(`ckan_datastore_error:${payload.error?.message ?? "unknown"}`);
      }
      const rows = payload.result?.records ?? [];
      for (const row of rows) {
        if (!options.accept || options.accept(row)) accepted.push(row);
        if (accepted.length >= options.maxRows) break;
      }
      if (rows.length < pageSize || options.stopAfterPage?.(rows)) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return accepted;
}
