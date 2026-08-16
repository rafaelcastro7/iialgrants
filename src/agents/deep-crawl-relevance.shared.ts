// Pure relevance filter for the enricher's deep-crawl (see enricher.functions.ts).
// Decides whether a deep-crawled detail page is actually about the grant
// being enriched, before letting its content feed the field extractors.
//
// Deep crawl follows links from the grant's own official page and can land
// on a sibling page under a shared parent path (a funder's program hub
// linking to several distinct programs). Confirmed live: a "Tax Credit
// Attestations" grant on investquebec.com picked up its deadline from a
// sibling page about a press/journalism tax credit — a completely different
// program — because that sibling's URL shared the hub's parent path segment
// ("attestations-de-credits-dimpots/presse-dinformation-ecrite") and the
// old relevance check matched on the FULL url, not just its own page. The
// sibling's actual content never mentioned "credit" or "attestations" at
// all. Only the URL's own leaf segment is checked now, not the shared parent.

const TITLE_STOP_WORDS = new Set([
  "grant",
  "grants",
  "fund",
  "funding",
  "program",
  "programme",
  "award",
  "awards",
  "support",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

// Distinctive words from the grant's own title, used to judge whether a
// deep-crawled page is actually about this grant. Short/generic words
// ("grant", "fund", ...) are excluded since they'd match almost anything.
export function grantTitleTokens(title: string): string[] {
  return Array.from(
    new Set(
      stripDiacritics(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !TITLE_STOP_WORDS.has(token)),
    ),
  );
}

export function pageLooksRelevantToGrant(
  page: { url: string; markdown: string },
  titleTokens: string[],
): boolean {
  if (titleTokens.length === 0) return true;
  const leafSegment = page.url.replace(/\/+$/, "").split("/").pop() ?? "";
  const hay = stripDiacritics(`${leafSegment}\n${page.markdown.slice(0, 2_500)}`).toLowerCase();
  const overlap = titleTokens.filter((token) => hay.includes(token)).length;
  return overlap >= Math.min(2, titleTokens.length);
}
