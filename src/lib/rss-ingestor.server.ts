// Server-only RSS ingestor for Canadian government funding feeds.
// Polls a small set of official RSS endpoints, matches items to known funders
// by domain or keyword, and enqueues a selective discovery job for matched
// funders. Designed to run on pg_cron (hourly) via /api/public/hooks/rss-poll.
//
// All feeds below are public and free. Add more in DEFAULT_FEEDS.

export type FeedItem = {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  sourceFeed: string;
};

export const DEFAULT_FEEDS: string[] = [
  // Innovation, Science and Economic Development Canada — news RSS.
  "https://www.ic.gc.ca/eic/site/icgc.nsf/eng/rss.xml",
  // NRC IRAP / National Research Council news.
  "https://nrc.canada.ca/en/news/rss.xml",
  // Government of Canada — funding & financial assistance news.
  "https://www.canada.ca/en/news/web-feeds.html",
];

// Parse a very small subset of RSS/Atom we need (title/link/pubDate/description).
// Avoids adding a dependency.
export function parseFeed(xml: string, sourceFeed: string): FeedItem[] {
  const items: FeedItem[] = [];
  // RSS <item> blocks
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    items.push({
      title: pickTag(block, "title"),
      link: pickTag(block, "link"),
      pubDate: pickTag(block, "pubDate") || pickTag(block, "dc:date"),
      description: pickTag(block, "description"),
      sourceFeed,
    });
  }
  // Atom <entry> blocks
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    items.push({
      title: pickTag(block, "title"),
      link: linkMatch?.[1] ?? "",
      pubDate: pickTag(block, "updated") || pickTag(block, "published"),
      description: pickTag(block, "summary") || pickTag(block, "content"),
      sourceFeed,
    });
  }
  return items.filter((i) => i.link.startsWith("http"));
}

function pickTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const GRANT_KEYWORDS = [
  /grant/i, /funding/i, /program/i, /subvention/i, /financement/i, /bourse/i,
  /aide/i, /cr[eé]dit/i, /pr[eê]t/i, /investiss/i, /scholarship/i,
];

export function looksLikeFundingNews(item: FeedItem): boolean {
  const blob = `${item.title} ${item.description ?? ""}`;
  return GRANT_KEYWORDS.some((re) => re.test(blob));
}

export type IngestResult = {
  feedsPolled: number;
  itemsParsed: number;
  itemsRelevant: number;
  fundersMatched: string[];
  jobId: string | null;
};

// Fetch feeds, classify, match to active funders by domain, enqueue a
// discovery job for matched funders.
export async function ingestRssFeeds(opts: { feeds?: string[] } = {}): Promise<IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const feeds = opts.feeds ?? DEFAULT_FEEDS;

  let itemsParsed = 0;
  const relevant: FeedItem[] = [];
  for (const url of feeds) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "IIAL/0.1" } });
      clearTimeout(t);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseFeed(xml, url);
      itemsParsed += items.length;
      for (const it of items) if (looksLikeFundingNews(it)) relevant.push(it);
    } catch { /* skip bad feed */ }
  }

  // Match relevant items to active funders by registered domain.
  const { data: funders } = await supabaseAdmin
    .from("funders")
    .select("id, name, source_url")
    .eq("active", true)
    .not("source_url", "is", null);

  const matched = new Set<string>();
  const matchedNames: string[] = [];
  for (const f of funders ?? []) {
    let host = "";
    try { host = new URL((f as { source_url: string }).source_url).host.replace(/^www\./, ""); } catch { continue; }
    for (const it of relevant) {
      let ihost = "";
      try { ihost = new URL(it.link).host.replace(/^www\./, ""); } catch { continue; }
      if (ihost === host || ihost.endsWith("." + host) || host.endsWith("." + ihost)) {
        if (!matched.has(f.id)) {
          matched.add(f.id);
          matchedNames.push((f as { name: string }).name);
        }
      }
    }
  }

  // Log the poll as an agent_run for auditability.
  const runId = crypto.randomUUID();
  await supabaseAdmin.from("agent_runs").insert({
    run_id: runId,
    agent: "discoverer",
    status: "succeeded",
    model: "rss/ingestor",
    metadata: {
      stage: "rss_poll",
      feeds: feeds.length,
      items_parsed: itemsParsed,
      items_relevant: relevant.length,
      funders_matched: matchedNames,
    },
  });

  let jobId: string | null = null;
  if (matched.size > 0) {
    jobId = crypto.randomUUID();
    const { runDiscoveryJob } = await import("@/agents/discoverer-orchestrator.server");
    // Fire-and-forget; no user attribution (RSS is system-triggered).
    const systemUserId = "00000000-0000-0000-0000-000000000000";
    void runDiscoveryJob(jobId, systemUserId, [...matched]).catch((e) => {
      console.error("[rss-ingestor] discovery job crashed", e);
    });
  }

  return {
    feedsPolled: feeds.length,
    itemsParsed,
    itemsRelevant: relevant.length,
    fundersMatched: matchedNames,
    jobId,
  };
}
