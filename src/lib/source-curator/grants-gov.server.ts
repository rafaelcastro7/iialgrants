// US Federal Grants.gov — public Search2 REST API (no auth, launched as part
// of the 2025 Simpler.Grants.gov relaunch). Replaces a dead RSS feed
// (rss.grants.gov/rss/GG_NewOppByCategory.xml, once bundled into
// rss-grants.server.ts's GRANT_FEEDS) that started returning the grants.gov
// website's HTML instead of XML — parseFeed() silently produced zero items,
// so this was the one supposedly-already-there non-Canada source that never
// actually contributed a single US funder. Verified live 2026-07-23:
// hitCount 1744+ open/forecasted opportunities.
import type { RawCandidate } from "./scoring.server";

const SEARCH2_URL = "https://api.grants.gov/v1/api/search2";

type OppHit = {
  id?: string;
  number?: string;
  title?: string;
  agencyCode?: string;
  agency?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
};

export async function fetchGrantsGovAgencies(limit = 100): Promise<RawCandidate[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(SEARCH2_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: limit,
        keyword: "",
        oppStatuses: "forecasted|posted",
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`grants_gov_http_${response.status}`);
    const payload = (await response.json()) as {
      errorcode?: number;
      data?: { oppHits?: OppHit[] };
    };
    if (payload.errorcode !== 0) throw new Error(`grants_gov_api_error_${payload.errorcode}`);
    const hits = payload.data?.oppHits;
    if (!Array.isArray(hits)) throw new Error("grants_gov_invalid_response");

    // One candidate per issuing agency (RawCandidate models funders, not
    // individual opportunities) — an agency like NIH posts many synopses.
    const byAgency = new Map<string, RawCandidate>();
    for (const hit of hits) {
      if (!hit.agency || !hit.agencyCode) continue;
      const key = hit.agencyCode;
      const existing = byAgency.get(key);
      if (existing) {
        const signals = existing.source_signals;
        if (signals.length < 6) signals.push(`grants_gov:${hit.number ?? hit.id}`);
        continue;
      }
      byAgency.set(key, {
        name: hit.agency,
        funder_type: "US Federal",
        website: `https://www.grants.gov/search-grants?agencies=${encodeURIComponent(hit.agencyCode)}`,
        source_signals: ["grants_gov", `grants_gov:${hit.number ?? hit.id}`],
        raw_metadata: {
          agency_code: hit.agencyCode,
          sample_title: hit.title ?? "",
          sample_opp_status: hit.oppStatus ?? "",
        },
      });
    }
    return [...byAgency.values()];
  } finally {
    clearTimeout(timer);
  }
}
