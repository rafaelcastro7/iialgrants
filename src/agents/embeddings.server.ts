// Ollama embeddings client (server-only).
// Uses nomic-embed-text (768 dims) for pgvector HNSW.
const EMB_URL = process.env.OLLAMA_BASE_URL
  ? `${process.env.OLLAMA_BASE_URL}/api/embeddings`
  : "http://localhost:11434/api/embeddings";
export const EMBEDDING_MODEL = "nomic-embed-text";
export const EMBEDDING_DIMS = 768;

export async function embedText(input: string | string[]): Promise<number[][]> {
  const maxRetries = 2;
  const texts = Array.isArray(input) ? input : [input];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const embeddings: number[][] = [];
      for (const text of texts) {
        const res = await fetch(EMB_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
          signal: ctrl.signal,
        });
        if (res.status === 429 && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        if (res.status === 429) throw new Error("rate_limited: embeddings 429");
        if (!res.ok) throw new Error(`embeddings_error_${res.status}: ${await res.text()}`);
        const json = await res.json();
        embeddings.push(json.embedding);
      }
      return embeddings;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("embeddings_max_retries");
}
