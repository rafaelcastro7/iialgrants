// EU Funding & Tenders Portal public Search API. The API requires POST with a
// multipart JSON query; GET returns 405. Retains current, open, English grant
// calls and emits their framework as a funder signal — genuinely EU-wide, not
// filtered down to Canada-relevant calls only (a `text: "Canada"` search-term
// filter used to sit here, which meant this was effectively a "Canada
// mentions in EU calls" ingester rather than a real EU funding source).
//
// `text` is a REQUIRED query param (confirmed live 2026-07-23: omitting it
// entirely — my first attempt at the fix above — gets HTTP 400 "Required
// request parameter 'text'... is not present", which silently broke this
// ingester until now, since fetchEuCalls has no catch and runSource's own
// catch just marks the whole run "failed" with no visible symptom besides
// that). An explicit EMPTY string satisfies "present" without narrowing
// results: verified live, totalResults 21,128 vs erroring out entirely.
//
// Second regression found the same day, also silent (status stayed
// "succeeded" — an empty array isn't an error): the API's `results[].language`
// is essentially unfilterable from the *outside* — without a `text` term the
// index returns same-language runs (confirmed live: 50/50 "bg" for several
// pageNumbers straight) and a top-level `languages=en` query param is
// silently ignored. The only thing that actually works is adding `language`
// as its own `terms` clause INSIDE the bool query body, same shape as
// `type`/`status` below (confirmed live: 1418 results, 50/50 "en"). Without
// this the old post-fetch `hit.language !== "en"` filter just dropped every
// row and produced a "succeeded" run with rows_in: 0, candidates_out: 0.

import type { RawCandidate } from "./scoring.server";

const BASE = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const OPEN_STATUSES = ["31094501", "31094502"];
const FRAMEWORK_LABELS: Record<string, string> = { "43108390": "Horizon Europe" };

type Hit = {
  language?: string;
  url?: string;
  metadata?: {
    title?: string[];
    callTitle?: string[];
    frameworkProgramme?: string[];
    deadlineDate?: string[];
    status?: string[];
  };
};

export async function fetchEuCalls(limit = 50): Promise<RawCandidate[]> {
  const params = new URLSearchParams({
    apiKey: "SEDIA",
    text: "",
    pageSize: String(limit),
    pageNumber: "1",
  });
  const query = {
    bool: {
      must: [{ terms: { type: ["1", "2", "8"] } }, { terms: { status: OPEN_STATUSES } }],
    },
  };
  const form = new FormData();
  form.append(
    "query",
    new Blob([JSON.stringify(query)], { type: "application/json" }),
    "query.json",
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${BASE}?${params}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`eu_ft_http_${response.status}`);
    const payload = (await response.json()) as { results?: Hit[] };
    if (!Array.isArray(payload.results)) throw new Error("eu_ft_invalid_response");

    const now = Date.now();
    const candidates = new Map<string, RawCandidate>();
    for (const hit of payload.results) {
      if (hit.language !== "en" || !hit.url?.startsWith("http")) continue;
      const deadline = hit.metadata?.deadlineDate?.[0];
      if (deadline && new Date(deadline).getTime() < now) continue;
      const frameworkCode = hit.metadata?.frameworkProgramme?.[0] ?? "European Commission";
      const framework = FRAMEWORK_LABELS[frameworkCode] ?? frameworkCode;
      if (candidates.has(framework)) continue;
      candidates.set(framework, {
        name: `European Commission — ${framework}`,
        funder_type: "International (EU)",
        website: hit.url,
        source_signals: ["eu_ft_portal"],
        raw_metadata: {
          sample_call: hit.metadata?.title?.[0] ?? hit.metadata?.callTitle?.[0] ?? "",
          deadline: deadline ?? null,
          framework_code: frameworkCode,
        },
      });
    }
    return [...candidates.values()];
  } finally {
    clearTimeout(timer);
  }
}
