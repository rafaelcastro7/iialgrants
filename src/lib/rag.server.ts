// Hybrid retrieval: BM25 (full-text) ∪ vector similarity, RRF-fused.
// Server-only. Caller passes the per-user supabase client (RLS-scoped).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { embedText } from "@/agents/embeddings.server";

export type RagHit = {
  id: string;
  content: string;
  source: string;
  language: "en" | "fr";
  score: number;
};

type Sb = SupabaseClient<Database>;

// Reciprocal Rank Fusion (k=60 standard).
function rrf(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return scores;
}

export async function ragRetrieve(
  supabase: Sb,
  userId: string,
  query: string,
  topK = 6,
): Promise<RagHit[]> {
  // 1) BM25 via Postgres FTS (simple config covers EN + FR ok for MVP).
  const tsQuery = query
    .toLowerCase()
    .replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12)
    .join(" | ");

  const [{ data: ftsRows }, embeddings] = await Promise.all([
    tsQuery
      ? supabase
          .from("knowledge_chunks")
          .select("id, content, source, language")
          .eq("user_id", userId)
          .textSearch("content", tsQuery, { type: "websearch", config: "simple" })
          .limit(topK * 2)
      : Promise.resolve({ data: [] as Array<{ id: string; content: string; source: string; language: "en" | "fr" }> }),
    embedText(query),
  ]);

  const [queryEmbedding] = embeddings;
  const { data: vecRows } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding as unknown as string,
    match_user_id: userId,
    match_count: topK * 2,
  });

  const fts = (ftsRows ?? []) as Array<{ id: string; content: string; source: string; language: "en" | "fr" }>;
  const vec = (vecRows ?? []) as Array<{ id: string; content: string; source: string; language: "en" | "fr"; similarity: number }>;

  const fused = rrf([fts.map((r) => r.id), vec.map((r) => r.id)]);
  const byId = new Map<string, { id: string; content: string; source: string; language: "en" | "fr" }>();
  for (const r of [...fts, ...vec]) byId.set(r.id, r);

  return [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => {
      const r = byId.get(id)!;
      return { id: r.id, content: r.content, source: r.source, language: r.language, score };
    });
}
