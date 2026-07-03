/**
 * Hybrid search: BM25 (keyword) + semantic (embedding) combined.
 *
 * Problem: Semantic-only search misses exact matches ("$50,000 CAD")
 *         Keyword-only misses meaning ("grants for AI startups" != "artificial intelligence companies")
 *
 * Solution: Score both, weighted: 40% BM25 + 60% semantic
 *
 * NOTE: BM25 implementation deferred to Python whoosh or simple JS scoring.
 * For now, using simplified keyword scoring as placeholder.
 */

type Grant = {
  id: string;
  title: string;
  summary?: string | null;
  [key: string]: unknown;
};

type SearchResult = {
  grantId: string;
  title: string;
  score: number; // 0-100
  bm25Score: number;
  semanticScore: number;
  matchedKeywords: string[];
};

/**
 * Simple keyword scoring (placeholder for BM25).
 * In production: use tantivy-rs or Python whoosh for real BM25.
 */
function scoreBM25(
  text: string,
  query: string,
  boost: Record<string, number> = {},
): { score: number; matches: string[] } {
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const textLower = text.toLowerCase();

  let score = 0;
  const matches: string[] = [];

  for (const token of queryTokens) {
    const boost_factor = boost[token] ?? 1.0;
    // Escape regex metacharacters — user queries like "c++" or "$50,000"
    // must not crash RegExp construction or change match semantics.
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (textLower.match(new RegExp(`\\b${escaped}\\b`, "g")) || []).length;
    score += count * boost_factor;
    if (count > 0) {
      matches.push(token);
    }
  }

  return { score, matches };
}

/**
 * Semantic scoring (placeholder).
 * In production: compute embedding(query) + cosine similarity to grant embeddings.
 * Returns 0 until embeddings are wired in — the system is contractually
 * deterministic (same input → same output), so a random placeholder is not
 * acceptable; hybrid search degrades to keyword-only for now.
 */
function scoreSemanticPlaceholder(_query: string): number {
  return 0;
}

/**
 * Hybrid search across grant list.
 */
export function searchGrantsHybrid(
  grants: Grant[],
  query: string,
  opts: {
    weights?: { bm25: number; semantic: number };
    limit?: number;
  } = {},
): SearchResult[] {
  const weights = opts.weights ?? { bm25: 0.4, semantic: 0.6 };
  const limit = opts.limit ?? 20;

  // Boost keywords (amount, deadline, capability)
  const boosts: Record<string, number> = {
    CAD: 2.0,
    $: 1.5,
    deadline: 1.5,
    AI: 1.3,
    research: 1.1,
    nonprofit: 1.2,
    eligible: 1.2,
  };

  const results: SearchResult[] = [];

  for (const grant of grants) {
    const searchText = [grant.title, grant.summary || ""].join(" ");

    const { score: bm25, matches } = scoreBM25(searchText, query, boosts);
    const semanticScore = scoreSemanticPlaceholder(query);

    // Combine scores
    const combined = bm25 * weights.bm25 + semanticScore * weights.semantic;

    if (combined > 0 || matches.length > 0) {
      results.push({
        grantId: grant.id,
        title: grant.title,
        score: Math.min(100, combined),
        bm25Score: bm25,
        semanticScore: semanticScore,
        matchedKeywords: matches,
      });
    }
  }

  // Sort by combined score (descending)
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Quick keyword search (fast, used for basic filtering).
 */
export function searchGrantsKeyword(grants: Grant[], query: string, limit = 50): Grant[] {
  const queryLower = query.toLowerCase();
  const results = grants.filter((g) => {
    const text = [g.title, g.summary || ""].join(" ").toLowerCase();
    return text.includes(queryLower);
  });

  return results.slice(0, limit);
}
