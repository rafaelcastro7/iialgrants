import { describe, it, expect } from "vitest";
import { enrichGrantImpl } from "@/agents/enricher.functions";
import { evaluateGrantImpl } from "@/agents/evaluator.impl.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRANT_ID = process.env.LIVE_GRANT_ID;
const USER_ID = process.env.LIVE_USER_ID;
const RUN = !!GRANT_ID && !!USER_ID;

describe.skipIf(!RUN)("live pipeline", () => {
  it("enriches + evaluates a real grant end-to-end", async () => {
    console.log("\n[LIVE] === ENRICH ===");
    const e = await enrichGrantImpl(GRANT_ID!);
    console.log(JSON.stringify(e, null, 2));
    expect(e.ok).toBe(true);

    console.log("\n[LIVE] === EVALUATE ===");
    const v = await evaluateGrantImpl({
      grantId: GRANT_ID!,
      userId: USER_ID!,
      userSupabase: supabaseAdmin as never,
    });
    console.log(JSON.stringify(v, null, 2));

    console.log("\n[LIVE] === FINAL GRANT ===");
    const { data: g } = await supabaseAdmin
      .from("grants")
      .select(
        "status,title,summary,language,sectors,eligibility,amount_cad_min,amount_cad_max,deadline,fit_score",
      )
      .eq("id", GRANT_ID!)
      .single();
    console.log(JSON.stringify(g, null, 2));

    const { data: ev } = await supabaseAdmin
      .from("evidence_spans")
      .select("field,extraction_method,snippet")
      .eq("grant_id", GRANT_ID!);
    console.log(`\n[LIVE] evidence count=${ev?.length}`);
    for (const r of ev ?? [])
      console.log(`  - [${r.extraction_method}] ${r.field}: ${(r.snippet ?? "").slice(0, 120)}`);
  }, 600_000);
});
