import { describe, it, expect } from "vitest";
import { batchEnrichDiscovered, batchEvaluateAll, type BatchResult } from "@/agents/batch-pipeline.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Use the admin demo user ID
// Real admin user from demo seed
const ADMIN_USER_ID = "90240636-06d4-4c75-9f33-fbb3e60bf54a";

describe("batch pipeline", () => {
  it("enriches remaining discovered grants", async () => {
    const results = await batchEnrichDiscovered(ADMIN_USER_ID, 99);
    printReport("ENRICHMENT", results);
    const ok = results.filter((r) => r.enrich?.ok);
    const failed = results.filter((r) => !r.enrich?.ok);
    for (const r of failed) {
      console.error(`\n  [FAIL] ${r.grantId.slice(0, 8)} "${r.title.slice(0, 50)}": ${r.enrich?.error || r.enrich?.reason}`);
    }
    console.log(`\nSummary: ${ok.length} enriched, ${failed.length} failed out of ${results.length}`);
  }, 3_600_000);

  it("evaluates all enriched grants", async () => {
    const results = await batchEvaluateAll(ADMIN_USER_ID);
    printReport("EVALUATION", results);
    const ok = results.filter((r) => r.evaluate?.ok);
    const failed = results.filter((r) => !r.evaluate?.ok);
    for (const r of failed) {
      console.error(`\n  [FAIL] ${r.grantId.slice(0, 8)} "${r.title.slice(0, 50)}": ${r.evaluate?.error}`);
    }
    console.log(`\nSummary: ${ok.length} scored, ${failed.length} failed out of ${results.length}`);
  }, 600_000);

});

function printReport(phase: string, results: BatchResult[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${phase} RESULTS — ${results.length} grants`);
  console.log(`${'='.repeat(60)}`);

  for (const r of results) {
    const status = r.enrich?.ok ?? r.evaluate?.ok ? "✓" : "✗";
    const detail = r.enrich
      ? `${r.enrich.ok ? "OK" : "FAIL"} ${r.enrich.filled?.join(", ") || ""}`
      : r.evaluate
        ? `${r.evaluate.ok ? `score=${r.evaluate.fit_score}` : "FAIL"}`
        : "?";
    console.log(`  ${status} ${r.grantId.slice(0, 8)} "${r.title.slice(0, 50)}" → ${detail}`);
    if (r.improvements.length > 0) {
      for (const imp of r.improvements) {
        console.log(`     ⚡ ${imp}`);
      }
    }
  }
}
