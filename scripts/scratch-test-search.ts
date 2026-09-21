import { createClient } from "@supabase/supabase-js";
import { searchGrantCatalogHybrid } from "../src/lib/grant-search-hybrid.server";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const queries = [
  "AI healthcare startup Montreal",
  "intelligence artificielle santé",
  "clean tech green innovation Ontario",
  "indigenous youth education nonprofit",
  "IRAP technology commercialization SME",
  "agritech sustainable farming Quebec",
];

for (const q of queries) {
  console.log("\n==================================================");
  console.log(`QUERY: "${q}"`);
  console.log("==================================================");
  const start = performance.now();
  const res = await searchGrantCatalogHybrid(supabase, q, 10, "hybrid");
  const elapsed = (performance.now() - start).toFixed(1);

  console.log(`Latency: ${elapsed}ms | Diagnostics:`, res.diagnostics);
  if (res.degradedReason) console.log(`Degraded: ${res.degradedReason}`);
  console.log(`Matches found: ${res.matches.length}`);

  for (let i = 0; i < Math.min(5, res.matches.length); i++) {
    const m = res.matches[i];
    const { data: g } = await supabase
      .from("grants")
      .select("id, title, country, amount_cad_max, deadline")
      .eq("id", m.grantId)
      .single();
    console.log(
      `  #${i + 1}: [Rel: ${m.relevance.toFixed(3)} | Lex: ${m.lexicalScore.toFixed(2)} | Sem: ${m.semanticScore.toFixed(2)} | Mode: ${m.retrievalMode}] (${g?.country}) ${g?.title?.slice(0, 70)}...`,
    );
  }
}
