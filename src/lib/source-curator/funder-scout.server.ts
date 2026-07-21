import { callLlm } from "@/agents/llm.server";
import { jinaSearch } from "@/lib/web-fetch.server";
import type { RawCandidate } from "./scoring.server";

const QUERIES = [
  '"grants for nonprofits" Canada "workforce" OR "credentials" site:.ca 2026',
  '"funding opportunities" Canada "micro-credentials" OR "skills training" site:.ca',
  '"call for proposals" Canada "applied research" "industry partnership" site:.ca',
  '"funding" Canada "smart cities" OR "urban innovation" site:.ca',
  '"climate" "funding" Canada nonprofit "deadline" site:.ca',
  '"international development" Canada funding "call for proposals" site:.ca',
];

type ClassifiedHit = { name: string; url: string; reason: string };

const SYSTEM_PROMPT = `You triage Canadian funding-program search hits.
Identify only grant-making organizations (foundations, government agencies,
councils, or programs), never articles, news, university research pages, or
consulting firms. Return strict JSON: {"hits":[{"name":"...","url":"https://...","reason":"<=120 chars"}]}.
Only include high-confidence hits. Return an empty hits array when none qualify.`;

export async function runFunderScout(): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const failures: string[] = [];
  for (const query of QUERIES) {
    const search = await jinaSearch(query, 6);
    if (!search.ok) {
      failures.push(`search:${search.error ?? "unknown"}`);
      continue;
    }
    if (search.hits.length === 0) continue;
    const hitBlock = search.hits
      .map((hit, index) => `${index + 1}. ${hit.title}\n   ${hit.url}\n   ${hit.snippet}`)
      .join("\n\n");
    try {
      const response = await callLlm({
        agent: "discoverer",
        responseFormat: "json",
        maxOutputTokens: 600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Query: ${query}\n\nResults:\n${hitBlock}` },
        ],
      });
      const parsed = JSON.parse(response.text) as { hits?: ClassifiedHit[] };
      for (const hit of parsed.hits ?? []) {
        if (!hit.name || !hit.url?.startsWith("http")) continue;
        candidates.push({
          name: hit.name.slice(0, 200),
          funder_type: "Scout-discovered",
          website: hit.url,
          source_signals: ["funder_scout"],
          raw_metadata: { scout_reason: hit.reason, scout_query: query },
        });
      }
    } catch (error) {
      failures.push(`classification:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (candidates.length === 0 && failures.length > 0) {
    throw new Error(`funder_scout_all_paths_failed:${failures.slice(0, 3).join("|")}`);
  }
  const seenHosts = new Set<string>();
  return candidates.filter((candidate) => {
    try {
      const host = new URL(candidate.website ?? "").host;
      if (!host || seenHosts.has(host)) return false;
      seenHosts.add(host);
      return true;
    } catch {
      return false;
    }
  });
}
