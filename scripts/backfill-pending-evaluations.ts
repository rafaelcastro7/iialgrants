// One-off batch backfill: enrich + evaluate every "discovered" grant that has
// never been evaluated, invoking the exact same enrichGrantImpl/
// evaluateGrantImpl the UI calls (not a separate reimplementation) so results
// are identical to clicking through the app one grant at a time.
//
// Usage: bun scripts/backfill-pending-evaluations.ts [--limit=N] [--user=<uuid>]
import { createClient } from "@supabase/supabase-js";
import { enrichGrantImpl } from "../src/agents/enricher.functions";
import { evaluateGrantImpl } from "../src/agents/evaluator.impl.server";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1])) : 5;
const userArg = process.argv.find((a) => a.startsWith("--user="));
const userId = userArg ? userArg.split("=")[1] : "ac6a7766-f6ba-4d36-95d2-44f7165d9924";

const { data: candidates, error } = await supabase
  .from("grants")
  .select("id, title")
  .eq("status", "discovered")
  .order("discovered_at", { ascending: true })
  .limit(limit);
if (error) throw new Error(error.message);

console.log(`Backfilling ${candidates?.length ?? 0} grant(s) as user ${userId}`);

for (const g of candidates ?? []) {
  console.log(`\n--- ${g.id} :: ${g.title} ---`);
  try {
    const enrichResult = await enrichGrantImpl(g.id, { userId });
    console.log(
      `enrich: ok=${enrichResult.ok} skipped=${enrichResult.skipped ?? false} reason=${enrichResult.reason ?? "-"} filled=${(enrichResult.filled ?? []).join(",") || "-"}`,
    );
    if (!enrichResult.ok) {
      console.log(`  enrich error: ${enrichResult.error ?? "unknown"}`);
      continue;
    }
    if (enrichResult.skipped) {
      console.log(`  skipping evaluation: enrichment did not complete (${enrichResult.reason})`);
      continue;
    }
    const evalResult = await evaluateGrantImpl({ grantId: g.id, userId, userSupabase: supabase });
    console.log(`evaluate: ${JSON.stringify(evalResult).slice(0, 300)}`);
  } catch (e) {
    console.log(`  FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\nDone.");
