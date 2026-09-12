import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings-cache.server", () => ({
  getEmbeddingCached: vi.fn(async () => Array(768).fill(0.1)),
}));

import { searchGrantCatalogHybrid } from "./grant-search-hybrid.server";
import { getEmbeddingCached } from "@/lib/embeddings-cache.server";

describe("hybrid grant retrieval", () => {
  it("fuses lexical and semantic ranks and exposes evidence", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "search_grant_catalog"
        ? { data: [{ grant_id: "lex", relevance: 0.8, matched_on: "title" }], error: null }
        : {
            data: [
              { grant_id: "semantic", semantic_similarity: 0.9 },
              { grant_id: "lex", semantic_similarity: 0.7 },
            ],
            error: null,
          },
    );
    const result = await searchGrantCatalogHybrid({ rpc } as never, "healthy aging", 10);
    expect(result.degradedReason).toBeNull();
    expect(result.matches[0]).toMatchObject({ grantId: "lex", retrievalMode: "hybrid" });
    expect(result.matches.find((item) => item.grantId === "semantic")).toMatchObject({
      matchedOn: "semantic meaning",
      semanticScore: 0.9,
    });
    expect(result.diagnostics).toMatchObject({
      lexicalCandidates: 1,
      semanticCandidates: 1,
      fusedCandidates: 2,
    });
  });

  it("supports an explicit lexical-only rollback without calling embeddings", async () => {
    vi.mocked(getEmbeddingCached).mockClear();
    const rpc = vi.fn(async (name: string) => {
      if (name === "search_grant_catalog") {
        return { data: [{ grant_id: "lex", relevance: 0.8, matched_on: "title" }], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    const result = await searchGrantCatalogHybrid({ rpc } as never, "research", 10, "lexical-only");

    expect(result.degradedReason).toBeNull();
    expect(result.matches[0]).toMatchObject({ grantId: "lex", retrievalMode: "lexical-only" });
    expect(getEmbeddingCached).not.toHaveBeenCalled();
  });
});
