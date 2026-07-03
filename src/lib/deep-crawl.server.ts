// Deep-crawl helper for the enricher.
//
// When the main grant page leaves fields missing (amount, deadline,
// eligibility, sectors), the most common reason is that those details live on
// a linked sub-page ("Eligibility", "How to apply", "Deadlines", "Funding").
// This helper first follows high-value same-host links already present in the
// scraped markdown, then optionally uses a same-host search to discover
// official pages that the landing page forgot to link.
//
// Bounded + defensive: same-host only, capped page count, per-page failures are
// swallowed. Server-only (imports the fetch fallback chain).

import type { SearchHit } from "@/lib/web-fetch.server";
import { scrapeWithFallback, searchWeb } from "@/lib/web-fetch.server";
import {
  buildOfficialSearchQueries,
  fetchCandidateLinksFromPage,
  fetchCandidateLinksFromSitemaps,
} from "@/lib/site-candidates.server";

const KEYWORDS = [
  "eligib",
  "who can apply",
  "apply",
  "application",
  "how-to-apply",
  "how to apply",
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
];

export type DeepPage = { url: string; markdown: string };

function normalizeUrl(url: string): string {
  return url.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
}

function scoreCandidate(text: string): number {
  const hay = text.toLowerCase();
  return KEYWORDS.reduce((score, keyword) => (hay.includes(keyword) ? score + 1 : score), 0);
}

function isSameHost(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).host === new URL(baseUrl).host;
  } catch {
    return false;
  }
}

function rankUrls(
  candidates: Array<{ url: string; text: string }>,
  baseUrl: string,
  seenUrls: string[],
  max: number,
): string[] {
  const seen = new Set<string>([normalizeUrl(baseUrl), ...seenUrls.map(normalizeUrl)]);
  const ranked: Array<{ url: string; score: number }> = [];

  for (const candidate of candidates) {
    if (!candidate.url || !isSameHost(candidate.url, baseUrl)) continue;
    const key = normalizeUrl(candidate.url);
    if (seen.has(key)) continue;
    const score = scoreCandidate(candidate.text);
    if (score === 0) continue;
    seen.add(key);
    ranked.push({ url: candidate.url, score });
  }

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, max))
    .map((item) => item.url);
}

export function pickDeepLinks(markdown: string, baseUrl: string, max = 3): string[] {
  const candidates: Array<{ url: string; text: string }> = [];
  const re = /\[([^\]]{0,160})\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(markdown)) !== null) {
    candidates.push({
      url: match[2],
      text: `${match[1]} ${match[2]}`,
    });
  }

  return rankUrls(candidates, baseUrl, [], max);
}

export function pickSearchHits(
  hits: SearchHit[],
  baseUrl: string,
  seenUrls: string[] = [],
  max = 3,
): string[] {
  return rankUrls(
    hits.map((hit) => ({
      url: hit.url,
      text: `${hit.title} ${hit.snippet} ${hit.url}`,
    })),
    baseUrl,
    seenUrls,
    max,
  );
}

async function scrapeCandidateUrls(urls: string[], max: number): Promise<DeepPage[]> {
  const pages: DeepPage[] = [];
  for (const url of urls) {
    if (pages.length >= max) break;
    try {
      const result = await scrapeWithFallback(url, {
        skipFirecrawl: true,
        minContentChars: 200,
      });
      if (result.ok && result.markdown.length >= 200) {
        pages.push({ url, markdown: result.markdown });
      }
    } catch {
      // Non-fatal: a dead sub-link must never break enrichment.
    }
  }
  return pages;
}

export async function gatherDeepMarkdown(
  baseUrl: string,
  mainMarkdown: string,
  opts: { max?: number; title?: string } = {},
): Promise<DeepPage[]> {
  const max = opts.max ?? 3;
  const inlineUrls = pickDeepLinks(mainMarkdown, baseUrl, max);
  const inlinePages = await scrapeCandidateUrls(inlineUrls, max);
  if (inlinePages.length >= max) return inlinePages;

  const seenUrls = [...inlineUrls, ...inlinePages.map((page) => page.url)];
  const htmlSeeded = await fetchCandidateLinksFromPage(baseUrl, {
    title: opts.title,
    seenUrls,
    max: max * 2,
    minimumTitleOverlap: opts.title ? 1 : 0,
  });
  const htmlPages = await scrapeCandidateUrls(
    htmlSeeded.map((candidate) => candidate.url),
    max - inlinePages.length,
  );
  if (inlinePages.length + htmlPages.length >= max) {
    return [...inlinePages, ...htmlPages].slice(0, max);
  }

  const sitemapSeeded = await fetchCandidateLinksFromSitemaps(baseUrl, {
    title: opts.title,
    seenUrls: [
      ...seenUrls,
      ...htmlSeeded.map((candidate) => candidate.url),
      ...htmlPages.map((page) => page.url),
    ],
    max: max * 3,
    minimumTitleOverlap: opts.title ? 1 : 0,
  });
  const sitemapPages = await scrapeCandidateUrls(
    sitemapSeeded.map((candidate) => candidate.url),
    max - inlinePages.length - htmlPages.length,
  );
  if (inlinePages.length + htmlPages.length + sitemapPages.length >= max) {
    return [...inlinePages, ...htmlPages, ...sitemapPages].slice(0, max);
  }

  const searchQueries = buildOfficialSearchQueries(baseUrl, opts.title);
  const searchHits: SearchHit[] = [];
  for (const query of searchQueries) {
    const hits = await searchWeb(query, 8);
    searchHits.push(...hits);
  }

  const searchUrls = pickSearchHits(
    searchHits,
    baseUrl,
    [
      ...seenUrls,
      ...htmlSeeded.map((candidate) => candidate.url),
      ...sitemapSeeded.map((candidate) => candidate.url),
      ...htmlPages.map((page) => page.url),
      ...sitemapPages.map((page) => page.url),
    ],
    max - inlinePages.length - htmlPages.length - sitemapPages.length,
  );
  const searchPages = await scrapeCandidateUrls(
    searchUrls,
    max - inlinePages.length - htmlPages.length - sitemapPages.length,
  );
  return [...inlinePages, ...htmlPages, ...sitemapPages, ...searchPages].slice(0, max);
}
