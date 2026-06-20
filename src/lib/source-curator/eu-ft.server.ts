// EU Funding & Tenders Portal — public Search API. Filters calls open to
// "Third country" / Canada-eligible programmes. Surfaces the *funding body*
// (European Commission DG, EIC, EIT, Horizon agency) as funder candidates;
// the live calls themselves get picked up later by the Discoverer once the
// funder is approved.

import type { RawCandidate } from "./scoring.server";

const BASE = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";

type Hit = {
  metadata?: {
    title?: string[];
    callTitle?: string[];
    frameworkProgramme?: string[];
    url?: string[];
    callIdentifier?: string[];
    callDeadlineDate?: string[];
  };
};

export async function fetchEuCalls(limit = 50): Promise<RawCandidate[]> {
  const params = new URLSearchParams({
    apiKey: "SEDIA",
    text: "Canada OR third country",
    pageSize: String(limit),
    pageNumber: "1",
  });
  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: Hit[] };
  const hits = json.results ?? [];
  const seen = new Map<string, RawCandidate>();
  for (const h of hits) {
    const framework = h.metadata?.frameworkProgramme?.[0] ?? "Horizon Europe";
    const callUrl = h.metadata?.url?.[0] ?? "";
    if (seen.has(framework)) continue;
    seen.set(framework, {
      name: `European Commission — ${framework}`,
      funder_type: "International (EU)",
      website: callUrl || "https://ec.europa.eu/info/funding-tenders/opportunities/portal/",
      source_signals: ["eu_ft_portal"],
      raw_metadata: { sample_call: h.metadata?.title?.[0] ?? h.metadata?.callTitle?.[0] ?? "" },
    });
  }
  return Array.from(seen.values());
}
