import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getEmbeddingCached } from "@/lib/embeddings-cache.server";
import { expandGrantSearchQuery } from "@/lib/grant-search-taxonomy.shared";

export type HybridGrantMatch = {
  grantId: string;
  relevance: number;
  lexicalScore: number;
  semanticScore: number;
  matchedOn: string;
  retrievalMode: "hybrid" | "lexical-fallback" | "lexical-only" | "shadow";
  queryConcepts: string[];
};

const RRF_K = 60;

export type GrantSearchDiagnostics = {
  lexicalCandidates: number;
  semanticCandidates: number;
  fusedCandidates: number;
  latencyMs: number;
};

export async function searchGrantCatalogHybrid(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 100,
  mode: "hybrid" | "lexical-only" | "shadow" = "hybrid",
): Promise<{
  matches: HybridGrantMatch[];
  degradedReason: string | null;
  diagnostics: GrantSearchDiagnostics;
}> {
  const startedAt = Date.now();
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const expansion = expandGrantSearchQuery(query);
  const lexicalResponses = await Promise.all(
    expansion.lexicalQueries.map((lexicalQuery) =>
      supabase.rpc("search_grant_catalog", {
        search_query: lexicalQuery,
        result_limit: boundedLimit,
      }),
    ),
  );
  const lexicalById = new Map<
    string,
    { grant_id: string; relevance: number; matched_on: string; fused: number }
  >();
  lexicalResponses.forEach((response, queryIndex) => {
    if (response.error) throw new Error(response.error.message);
    (response.data ?? []).forEach((row, rankIndex) => {
      const fused = row.relevance + (queryIndex === 0 ? 0.1 : 0) + 0.1 / (rankIndex + 1);
      const current = lexicalById.get(row.grant_id);
      if (!current || fused > current.fused) lexicalById.set(row.grant_id, { ...row, fused });
    });
  });
  const lexical = [...lexicalById.values()].sort((a, b) => b.fused - a.fused);

  let semantic: Array<{ grant_id: string; semantic_similarity: number }> = [];
  let degradedReason: string | null = null;
  try {
    if (mode === "lexical-only") throw new ForcedLexicalError();
    if (expansion.suppressSemantic) throw new SemanticSuppressedError();
    const embedding = await getEmbeddingCached(expansion.semanticQuery);
    if (embedding.length !== 768) throw new Error(`embedding_dimension_${embedding.length}`);
    const { data, error } = await supabase.rpc("match_grant_search_documents", {
      query_embedding: embedding as unknown as string,
      match_threshold: 0.35,
      match_count: Math.min(Math.max(boundedLimit * 2, 40), 100),
    });
    if (error) throw new Error(error.message);
    const candidates = data ?? [];
    const topSimilarity = candidates[0]?.semantic_similarity ?? 0;
    semantic = candidates
      .filter((candidate) => candidate.semantic_similarity >= Math.max(0.4, topSimilarity - 0.18))
      .slice(0, Math.min(boundedLimit, 30));
  } catch (error) {
    if (!(error instanceof SemanticSuppressedError) && !(error instanceof ForcedLexicalError)) {
      degradedReason = error instanceof Error ? error.message : String(error);
    }
  }

  const byId = new Map<string, HybridGrantMatch>();
  const ensure = (grantId: string) => {
    const existing = byId.get(grantId);
    if (existing) return existing;
    const created: HybridGrantMatch = {
      grantId,
      relevance: 0,
      lexicalScore: 0,
      semanticScore: 0,
      matchedOn: "semantic meaning",
      retrievalMode:
        mode === "lexical-only"
          ? "lexical-only"
          : mode === "shadow"
            ? "shadow"
            : degradedReason
              ? "lexical-fallback"
              : "hybrid",
      queryConcepts: expansion.concepts,
    };
    byId.set(grantId, created);
    return created;
  };

  const hasLexical = (lexical ?? []).length > 0;
  const hasSemantic = semantic.length > 0;
  const lexicalWeight = hasLexical ? (hasSemantic ? 0.55 : 1.0) : 0.0;
  const semanticWeight = hasSemantic ? (hasLexical ? 0.45 : 1.0) : 0.0;
  const theoreticalMaximum = 1 / (RRF_K + 1);

  for (const [index, row] of (lexical ?? []).entries()) {
    const match = ensure(row.grant_id);
    match.lexicalScore = row.relevance;
    match.matchedOn = row.matched_on;
    match.relevance += lexicalWeight / (RRF_K + index + 1);
  }
  for (const [index, row] of semantic.entries()) {
    const match = ensure(row.grant_id);
    match.semanticScore = row.semantic_similarity;
    if (!match.lexicalScore) match.matchedOn = "semantic meaning";
    match.relevance += semanticWeight / (RRF_K + index + 1);
  }

  const matches = [...byId.values()]
    .map((match) => ({ ...match, relevance: match.relevance / theoreticalMaximum }))
    .sort((a, b) => {
      if (mode === "shadow") {
        const aLexicalRank = lexical.findIndex((row) => row.grant_id === a.grantId);
        const bLexicalRank = lexical.findIndex((row) => row.grant_id === b.grantId);
        const aRank = aLexicalRank < 0 ? Number.MAX_SAFE_INTEGER : aLexicalRank;
        const bRank = bLexicalRank < 0 ? Number.MAX_SAFE_INTEGER : bLexicalRank;
        if (aRank !== bRank) return aRank - bRank;
      }
      return (
        b.relevance - a.relevance ||
        b.semanticScore - a.semanticScore ||
        b.lexicalScore - a.lexicalScore
      );
    })
    .slice(0, boundedLimit);
  return {
    matches,
    degradedReason,
    diagnostics: {
      lexicalCandidates: lexical.length,
      semanticCandidates: semantic.length,
      fusedCandidates: byId.size,
      latencyMs: Date.now() - startedAt,
    },
  };
}

class SemanticSuppressedError extends Error {}
class ForcedLexicalError extends Error {}
