// EU Funding & Tenders Portal public Search API. The API requires POST with a
// multipart JSON query; GET returns 405. We retain only current English grant
// calls that mention Canada and emit their framework as a funder signal.

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
    text: "Canada",
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
