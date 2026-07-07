// Web-wide LLM funder scout. Each run issues a small set of queries derived
// from IIAL's six strategic capabilities through Jina Search (free tier),
// fetches the top hits, and asks the LLM whether each result looks like a
// Canadian grant-making organization we don't already track. Hits that pass
// the classifier are emitted as funder candidates with low base score (LLM
// signal alone) so that the standard curator gate (score + signal count)
// still applies before auto-promotion.

import type { RawCandidate } from "./scoring.server";
import { jinaSearch } from "@/lib/web-fetch.server";
import { callLlm } from "@/agents/llm.server";

// Six capabilities → search prompts. Kept short to fit Jina free-tier limits.
const QUERIES: string[] = [
  '"grants for nonprofits" Canada "workforce" OR "credentials" site:.ca 2026',
  '"funding opportunities" Canada "micro-credentials" OR "skills training" site:.ca',
  '"call for proposals" Canada "applied research" "industry partnership" site:.ca',
  '"funding" Canada "smart cities" OR "urban innovation" site:.ca',
  '"climate" "funding" Canada nonprofit "deadline" site:.ca',
  '"international development" Canada funding "call for proposals" site:.ca',
];

type ClassifiedHit = { name: string; url: string; reason: string };

const SYSTEM_PROMPT = `You triage Canadian funding-program search hits.
Given a list of search results, identify which ones are *grant-making organizations*
(foundations, government agencies, councils, councils, programs) — NOT articles,
blog posts, news, university research pages, or for-profit consulting firms.
Return strict JSON: {"hits":[{"name":"<org name>","url":"<canonical homepage URL>","reason":"<<=120 chars>"}, ...]}.
Only include hits with high confidence. Empty array if none qualify.`;

export async function runFunderScout(): Promise<RawCandidate[]> {
  const out: RawCandidate[] = [];
  for (const q of QUERIES) {
    const search = await jinaSearch(q, 6);
    if (!search.ok || search.hits.length === 0) continue;
    const hitBlock = search.hits
      .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
      .join("\n\n");
    try {
      const resp = await callLlm({
        agent: "discoverer",
        responseFormat: "json",
        maxOutputTokens: 600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Query: ${q}\n\nResults:\n${hitBlock}` },
        ],
      });
      const parsed = JSON.parse(resp.text) as { hits?: ClassifiedHit[] };
      for (const h of parsed.hits ?? []) {
        if (!h.name || !h.url?.startsWith("http")) continue;
        out.push({
          name: h.name.slice(0, 200),
          funder_type: "Scout-discovered",
          website: h.url,
          source_signals: [`funder_scout:${q.slice(0, 30)}`],
          raw_metadata: { scout_reason: h.reason, scout_query: q },
        });
      }
    } catch {
      /* LLM/JSON failure → skip this query */
    }
  }
  // De-dup by host
  const seen = new Set<string>();
  return out.filter((c) => {
    if (!c.website) return false;
    let host = "";
    try {
      host = new URL(c.website).host;
    } catch {
      return false;
    }
    if (seen.has(host)) return false;
    seen.add(host);
    return true;
  });
}
