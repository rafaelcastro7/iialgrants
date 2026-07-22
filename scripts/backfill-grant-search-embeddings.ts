import { createClient } from "@supabase/supabase-js";
import { embedText, EMBEDDING_MODEL } from "../src/agents/embeddings.server";
import { buildGrantSearchDocument } from "../src/lib/grant-search-document.shared";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1])) : 500;
const { data: grants, error } = await supabase
  .from("grants")
  .select(
    "id,title,title_fr,summary,summary_fr,sectors,eligibility,requirements,funder:funders(name,name_fr,jurisdiction)",
  )
  .not("status", "in", "(archived,expired,lost)")
  .limit(limit);
if (error) throw new Error(error.message);

let embedded = 0;
let skipped = 0;
for (const grant of grants ?? []) {
  const funder = Array.isArray(grant.funder) ? grant.funder[0] : grant.funder;
  const document = buildGrantSearchDocument({ ...grant, funder: funder ?? null });
  const { data: existing, error: existingError } = await supabase
    .from("grant_search_documents")
    .select("content_hash,embedding_model")
    .eq("grant_id", grant.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (
    existing?.content_hash === document.contentHash &&
    existing.embedding_model === EMBEDDING_MODEL
  ) {
    skipped++;
    continue;
  }
  const [embedding] = await embedText(document.embeddingText);
  if (!embedding || embedding.length !== 768) {
    throw new Error(`Unexpected embedding dimension for grant ${grant.id}: ${embedding?.length}`);
  }
  const { error: upsertError } = await supabase.from("grant_search_documents").upsert({
    grant_id: grant.id,
    content_en: document.contentEn,
    content_fr: document.contentFr,
    content_hash: document.contentHash,
    embedding: embedding as unknown as string,
    embedding_model: EMBEDDING_MODEL,
    embedded_at: new Date().toISOString(),
  });
  if (upsertError) throw new Error(`${grant.id}: ${upsertError.message}`);
  embedded++;
}

console.log(
  JSON.stringify({ scanned: grants?.length ?? 0, embedded, skipped, model: EMBEDDING_MODEL }),
);
