// Embedding cache layer — avoid re-embedding same text
// Uses in-memory Map as cache (production: would use Redis)
// TTL: 24 hours (grant markdown rarely changes intra-day)

import { createHash } from "crypto";

type CacheEntry = {
  embedding: number[];
  createdAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CacheEntry>();

function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Get embedding, using cache for repeated texts.
 * Automatically cleans up expired entries.
 *
 * NOTE: getEmbedding import deferred — use with:
 *   const { getEmbedding } = await import("@/agents/embeddings.server");
 */
export async function getEmbeddingCached(text: string): Promise<number[]> {
  const key = cacheKey(text);
  const cached = cache.get(key);

  if (cached) {
    const age = Date.now() - cached.createdAt;
    if (age < CACHE_TTL_MS) {
      // Cache hit
      return cached.embedding;
    } else {
      // Expired
      cache.delete(key);
    }
  }

  // Cache miss — fetch fresh
  const { embedText } = await import("@/agents/embeddings.server");
  const embeddings = await embedText(text);
  const embedding = embeddings[0];

  // Store in cache
  cache.set(key, {
    embedding,
    createdAt: Date.now(),
  });

  return embedding;
}

/**
 * Get cache stats (for monitoring)
 */
export function getCacheStats() {
  const now = Date.now();
  let valid = 0;
  let expired = 0;

  for (const [, entry] of cache) {
    if (now - entry.createdAt < CACHE_TTL_MS) {
      valid++;
    } else {
      expired++;
    }
  }

  return {
    totalEntries: cache.size,
    validEntries: valid,
    expiredEntries: expired,
    ttlMs: CACHE_TTL_MS,
  };
}

/**
 * Clear cache (mainly for testing)
 */
export function clearEmbeddingCache() {
  cache.clear();
}
