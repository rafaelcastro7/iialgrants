// Ollama embeddings client (server-only).
// Uses nomic-embed-text (768 dims) for pgvector HNSW.
const EMB_URL = process.env.OLLAMA_BASE_URL
  ? `${process.env.OLLAMA_BASE_URL}/api/embeddings`
  : "http://localhost:11434/api/embeddings";
export const EMBEDDING_MODEL = "nomic-embed-text";
export const EMBEDDING_DIMS = 768;
const EMBEDDING_TIMEOUT_MS = Number(process.env.OLLAMA_EMBEDDING_TIMEOUT_MS ?? 120_000);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function embedText(input: string | string[]): Promise<number[][]> {
  const maxRetries = 2;
  const texts = Array.isArray(input) ? input : [input];
  const embeddings: number[][] = [];

  // Retry per TEXT, not per batch: a mid-batch failure must not desynchronize
  // the output array from the input order (result[i] always embeds texts[i]).
  for (const text of texts) {
    let embedded = false;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries && !embedded; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), EMBEDDING_TIMEOUT_MS);
      try {
        const res = await fetch(EMB_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
          signal: ctrl.signal,
        });
        if (res.status === 429) {
          if (attempt < maxRetries) {
            await sleep(1000 * Math.pow(2, attempt));
            continue; // retry THIS text
          }
          throw new Error("rate_limited: embeddings 429");
        }
        if (!res.ok) throw new Error(`embeddings_error_${res.status}: ${await res.text()}`);
        const json = await res.json();
        embeddings.push(json.embedding);
        embedded = true;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
      } finally {
        clearTimeout(t);
      }
    }
    if (!embedded) {
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`embedding_failed_after_retries: ${message}`);
    }
  }
  return embeddings;
}
