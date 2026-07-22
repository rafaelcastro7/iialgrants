import { createClient } from "@supabase/supabase-js";
import {
  evaluateSearchCase,
  summarizeSearchBenchmark,
  type SearchBenchmarkCase,
} from "../src/evals/search/metrics";
import type { Database } from "../src/integrations/supabase/types";
import { searchGrantCatalogHybrid } from "../src/lib/grant-search-hybrid.server";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const cases = (await Bun.file(
  new URL("../src/evals/search/golden.cases.json", import.meta.url),
).json()) as SearchBenchmarkCase[];
const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const activeStatuses = new Set([
  "discovered",
  "enriched",
  "scored",
  "shortlisted",
  "in_proposal",
  "submitted",
  "won",
]);
const rows = [];
const staleCaseIds: string[] = [];
const relevantIds = [...new Set(cases.flatMap((testCase) => Object.keys(testCase.relevance)))];
const { data: relevantGrants, error: relevantError } = await supabase
  .from("grants")
  .select("id,status")
  .in("id", relevantIds);
if (relevantError) throw new Error(relevantError.message);
const activeRelevantIds = new Set(
  (relevantGrants ?? [])
    .filter((grant) => activeStatuses.has(grant.status))
    .map((grant) => grant.id),
);

for (const testCase of cases) {
  const effectiveRelevance = Object.fromEntries(
    Object.entries(testCase.relevance).filter(([grantId]) => activeRelevantIds.has(grantId)),
  );
  if (Object.keys(testCase.relevance).length > 0 && Object.keys(effectiveRelevance).length === 0) {
    staleCaseIds.push(testCase.id);
    continue;
  }
  const { matches } = await searchGrantCatalogHybrid(supabase, testCase.query, 50);
  const ids = matches.map((row) => row.grantId);
  let activeIds: string[] = [];
  if (ids.length > 0) {
    const { data: grants, error: grantsError } = await supabase
      .from("grants")
      .select("id,status")
      .in("id", ids);
    if (grantsError) throw new Error(`${testCase.id}: ${grantsError.message}`);
    const activeById = new Set(
      (grants ?? []).filter((grant) => activeStatuses.has(grant.status)).map((grant) => grant.id),
    );
    activeIds = ids.filter((id) => activeById.has(id));
  }
  rows.push(evaluateSearchCase({ ...testCase, relevance: effectiveRelevance }, activeIds, 10));
}

const report = {
  generatedAt: new Date().toISOString(),
  ranking: "hybrid_rrf_v1",
  k: 10,
  summary: summarizeSearchBenchmark(rows),
  staleCaseIds,
  cases: rows,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--enforce")) {
  const { recallAtK, precisionAtK, ndcgAtK, hardFailLeakage } = report.summary;
  if (recallAtK < 0.9 || precisionAtK < 0.75 || ndcgAtK < 0.8 || hardFailLeakage > 0) {
    process.exitCode = 1;
  }
}
