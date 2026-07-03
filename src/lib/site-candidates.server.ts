const DISCOVERY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const POSITIVE_KEYWORDS = [
  "eligib",
  "apply",
  "application",
  "deadline",
  "dates",
  "timeline",
  "intake",
  "fund",
  "funding",
  "amount",
  "award",
  "value",
  "contribution",
  "guideline",
  "guidelines",
  "criteria",
  "requirement",
  "detail",
  "program",
  "programme",
  "grant",
  "subvention",
  "scholarship",
  "loan",
];

const NEGATIVE_PATTERN =
  /(\babout\b|\bcontact\b|\bpress\b|\bnews\b|\bblog\b|\bcareer\b|\bjobs\b|\bprivacy\b|\bterms\b|\blegal\b|\bcookie\b|\blogin\b|\bsign[-_ ]?in\b|\bsitemap\b|\bsearch\b|\brss\b|\bfeed\b|\bsponsor\b|\bcommandite\b|\bannual[-_ ]report\b|\bevents?\b|\bevenements?\b|\bwebinair\b|\bpartners?\b|\bpartenaires\b)/i;

const TITLE_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "your",
  "this",
  "that",
  "program",
  "programme",
  "fund",
  "funding",
  "grant",
  "grants",
  "award",
  "awards",
  "suite",
  "component",
  "stream",
  "canada",
  "canadian",
  "research",
]);

export type OfficialCandidate = {
  url: string;
  text: string;
  score: number;
};

function normalizeUrl(url: string): string {
  return url.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function titleTokens(title?: string): string[] {
  return normalizeText(title ?? "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !TITLE_STOPWORDS.has(token));
}

function countTitleOverlap(text: string, title?: string): number {
  const hay = normalizeText(text);
  return titleTokens(title).filter((token) => hay.includes(token)).length;
}

function scoreCandidate(text: string, title?: string): number {
  const hay = normalizeText(text);
  let score = 0;
  for (const keyword of POSITIVE_KEYWORDS) {
    if (hay.includes(keyword)) score += 1;
  }
  const overlapCount = countTitleOverlap(text, title);
  score += Math.min(overlapCount * 2, 8);
  return score;
}

function rankCandidates(
  candidates: Array<{ url: string; text: string }>,
  baseUrl: string,
  opts: { seenUrls?: string[]; title?: string; max?: number; minimumTitleOverlap?: number } = {},
): OfficialCandidate[] {
  const seen = new Set<string>([normalizeUrl(baseUrl), ...(opts.seenUrls ?? []).map(normalizeUrl)]);
  const ranked = new Map<string, OfficialCandidate>();
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).host;
  } catch {
    return [];
  }

  for (const candidate of candidates) {
    if (!candidate.url) continue;
    let parsed: URL;
    try {
      parsed = new URL(candidate.url, baseUrl);
    } catch {
      continue;
    }
    if (parsed.host !== baseHost) continue;
    if (!/^https?:$/.test(parsed.protocol)) continue;

    const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    const key = normalizeUrl(normalized);
    if (seen.has(key)) continue;

    const text = `${candidate.text} ${parsed.pathname}`.trim();
    if (!text || NEGATIVE_PATTERN.test(text)) continue;
    const overlapCount = countTitleOverlap(text, opts.title);
    if ((opts.minimumTitleOverlap ?? 0) > overlapCount) continue;

    const depth = parsed.pathname.split("/").filter(Boolean).length;
    const score = scoreCandidate(text, opts.title) + Math.min(depth, 4);
    if (score < 2) continue;

    const existing = ranked.get(key);
    if (!existing || existing.score < score) {
      ranked.set(key, { url: normalized, text: candidate.text, score });
    }
  }

  return Array.from(ranked.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, opts.max ?? ranked.size));
}

async function fetchText(url: string, timeoutMs: number, accept: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": DISCOVERY_UA,
        Accept: accept,
        "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.5",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractSitemapLocs(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    urls.push(decodeXml(match[1].trim()));
  }
  return urls;
}

function childSitemapUrls(origin: string, xml: string): string[] {
  return extractSitemapLocs(xml).filter((url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.origin === origin &&
        (/\.xml($|\?)/i.test(parsed.pathname) || parsed.pathname.toLowerCase().includes("sitemap"))
      );
    } catch {
      return false;
    }
  });
}

export function extractAnchorCandidatesFromHtml(
  html: string,
  baseUrl: string,
  opts: { seenUrls?: string[]; title?: string; max?: number; minimumTitleOverlap?: number } = {},
): OfficialCandidate[] {
  const candidates: Array<{ url: string; text: string }> = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const rawText = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawText || rawText.length < 3 || rawText.length > 180) continue;
    candidates.push({ url: match[1], text: rawText });
  }
  return rankCandidates(candidates, baseUrl, opts);
}

export function extractSitemapCandidatesFromXml(
  xml: string,
  baseUrl: string,
  opts: { seenUrls?: string[]; title?: string; max?: number; minimumTitleOverlap?: number } = {},
): OfficialCandidate[] {
  const candidates = extractSitemapLocs(xml).map((url) => ({ url, text: url }));
  return rankCandidates(candidates, baseUrl, opts);
}

export async function fetchCandidateLinksFromPage(
  baseUrl: string,
  opts: {
    seenUrls?: string[];
    title?: string;
    max?: number;
    timeoutMs?: number;
    minimumTitleOverlap?: number;
  } = {},
): Promise<OfficialCandidate[]> {
  const html = await fetchText(
    baseUrl,
    opts.timeoutMs ?? 10_000,
    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  );
  if (!html) return [];
  return extractAnchorCandidatesFromHtml(html, baseUrl, opts);
}

export async function fetchCandidateLinksFromSitemaps(
  baseUrl: string,
  opts: {
    seenUrls?: string[];
    title?: string;
    max?: number;
    timeoutMs?: number;
    minimumTitleOverlap?: number;
  } = {},
): Promise<OfficialCandidate[]> {
  let origin = "";
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const sitemapEntries = new Set<string>([`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]);

  const robotsText = await fetchText(`${origin}/robots.txt`, 4_000, "text/plain,*/*");
  if (robotsText) {
    const matches = robotsText.matchAll(/^sitemap:\s*(.+)$/gim);
    for (const match of matches) {
      sitemapEntries.add(match[1].trim());
    }
  }

  const seenUrls = new Set<string>(opts.seenUrls ?? []);
  const collected = new Map<string, OfficialCandidate>();
  const queue = [...sitemapEntries].slice(0, 4);

  for (let i = 0; i < queue.length && i < 6; i++) {
    const sitemapUrl = queue[i];
    const xml = await fetchText(
      sitemapUrl,
      opts.timeoutMs ?? 10_000,
      "application/xml,text/xml;q=0.9,*/*;q=0.8",
    );
    if (!xml) continue;

    const candidates = extractSitemapCandidatesFromXml(xml, baseUrl, {
      seenUrls: [...seenUrls],
      title: opts.title,
      max: (opts.max ?? 20) * 3,
      minimumTitleOverlap: opts.minimumTitleOverlap,
    });
    for (const candidate of candidates) {
      seenUrls.add(candidate.url);
      const existing = collected.get(candidate.url);
      if (!existing || existing.score < candidate.score) {
        collected.set(candidate.url, candidate);
      }
    }

    const children = childSitemapUrls(origin, xml);
    for (const child of children) {
      if (!queue.includes(child) && queue.length < 6) queue.push(child);
    }
  }

  return Array.from(collected.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, opts.max ?? collected.size));
}

export function buildOfficialSearchQueries(baseUrl: string, title?: string): string[] {
  let host = "";
  let path = "";
  try {
    const parsed = new URL(baseUrl);
    host = parsed.host;
    path = parsed.pathname;
  } catch {
    return [];
  }

  const titleParts = titleTokens(title).slice(0, 6).join(" ");
  const slugParts = normalizeText(path)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 4 && token !== "html")
    .slice(-6)
    .join(" ");

  const queries = [
    titleParts && `site:${host} ${titleParts} eligibility deadline apply amount`,
    titleParts && `site:${host} ${titleParts} guide criteria funding`,
    slugParts && `site:${host} ${slugParts} eligibility deadline apply`,
    `site:${host} funding eligibility deadline apply`,
  ].filter(Boolean) as string[];

  return [...new Set(queries)];
}
