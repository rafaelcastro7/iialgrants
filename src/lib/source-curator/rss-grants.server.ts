// RSS-driven funder candidate generator. Polls feeds whose items are *grants*
// (IDRC, Tri-Council news) and extracts the issuing agency from each item as
// a funder_candidate. Lightweight: pure regex parser, no deps.
//
// Grants.gov (US federal) used to be a feed here too
// (rss.grants.gov/rss/GG_NewOppByCategory.xml) but that URL now 200s with
// the grants.gov website's HTML, not XML — silently zero real items forever.
// Replaced by grants-gov.server.ts's real Search2 REST API ingester.

import type { RawCandidate } from "./scoring.server";
import { parseFeed, type FeedItem } from "@/lib/rss-ingestor.server";

export const GRANT_FEEDS: Array<{ key: string; url: string; defaultAgency?: string }> = [
  {
    key: "idrc_rss",
    url: "https://www.idrc.ca/en/rss.xml",
    defaultAgency: "International Development Research Centre (IDRC)",
  },
  {
    key: "nserc_news",
    url: "https://www.nserc-crsng.gc.ca/Media-Media/NewsRelease-CommuniqueDePresse_RSS_eng.asp",
    defaultAgency: "Natural Sciences and Engineering Research Council of Canada (NSERC)",
  },
  {
    key: "sshrc_news",
    url: "https://www.sshrc-crsh.gc.ca/news_room-salle_de_presse/rss-eng.aspx",
    defaultAgency: "Social Sciences and Humanities Research Council of Canada (SSHRC)",
  },
  {
    key: "cihr_news",
    url: "https://cihr-irsc.gc.ca/e/rss.html",
    defaultAgency: "Canadian Institutes of Health Research (CIHR)",
  },
];

const AGENCY_RE =
  /^\s*([A-Z][A-Za-z &.,'-]{4,80}?)(?:\s*[-—:|]\s*|\s+announces|\s+awards|\s+launches|\s+opens)/;

function extractAgency(item: FeedItem, fallback?: string): string | null {
  if (fallback) return fallback;
  const m = item.title.match(AGENCY_RE);
  if (m && m[1].length > 5) return m[1].trim();
  // Last resort: derive from feed URL host
  try {
    const host = new URL(item.sourceFeed).hostname.replace(/^www\./, "");
    return host.split(".")[0].toUpperCase();
  } catch {
    return null;
  }
}

export async function fetchRssGrantCandidates(
  extraFeeds: Array<{ key: string; url: string; defaultAgency?: string }> = [],
): Promise<RawCandidate[]> {
  const seen = new Map<string, RawCandidate>();
  for (const feed of [...GRANT_FEEDS, ...extraFeeds]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      // A self-identifying UA gets 403'd by WAFs some funder sites already
      // run (confirmed elsewhere in this codebase — see web-fetch.server.ts);
      // the same proven realistic browser UA is strictly better here too.
      const { CHROME_UA } = await import("@/lib/web-fetch.server");
      const res = await fetch(feed.url, {
        signal: ctrl.signal,
        headers: { "User-Agent": CHROME_UA },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseFeed(xml, feed.url).slice(0, 25);
      for (const item of items) {
        const agency = extractAgency(item, feed.defaultAgency);
        if (!agency) continue;
        const key = agency.toLowerCase();
        if (seen.has(key)) {
          seen.get(key)!.source_signals.push(`${feed.key}:${item.pubDate ?? ""}`);
          continue;
        }
        let host = "";
        try {
          host = new URL(item.link).origin;
        } catch {
          /* skip */
        }
        seen.set(key, {
          name: agency,
          funder_type: "Federal",
          website: host || null,
          source_signals: [feed.key],
          raw_metadata: { sample_title: item.title.slice(0, 200), sample_link: item.link },
        });
      }
    } catch {
      /* skip feed on error */
    }
  }
  return Array.from(seen.values());
}
