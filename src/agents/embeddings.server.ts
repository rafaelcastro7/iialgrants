// Lovable AI Gateway embeddings client (server-only).
// Uses openai/text-embedding-3-small (1536 dims) to fit pgvector HNSW (<=2000 dims).
const EMB_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

export async function embedText(input: string | string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(EMB_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
        signal: ctrl.signal,
      });
      if (res.status === 429 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      if (res.status === 429) throw new Error("rate_limited: embeddings 429");
      if (res.status === 402) throw new Error("payment_required: embeddings credits");
      if (!res.ok) throw new Error(`embeddings_error_${res.status}: ${await res.text()}`);
      const json = await res.json();
      const list = (json?.data ?? []) as Array<{ embedding: number[] }>;
      return list.map((d) => d.embedding);
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("embeddings_max_retries");
}
