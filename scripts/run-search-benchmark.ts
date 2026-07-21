import { createClient } from "@supabase/supabase-js";
import {
  evaluateSearchCase,
  summarizeSearchBenchmark,
  type SearchBenchmarkCase,
} from "../src/evals/search/metrics";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const cases = (await Bun.file(
  new URL("../src/evals/search/golden.cases.json", import.meta.url),
).json()) as SearchBenchmarkCase[];
const supabase = createClient(url, key, {
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

for (const testCase of cases) {
  const { data: ranked, error } = await supabase.rpc("search_grant_catalog", {
    search_query: testCase.query,
    result_limit: 50,
  });
  if (error) throw new Error(`${testCase.id}: ${error.message}`);
  const ids = (ranked ?? []).map((row) => row.grant_id as string);
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
  rows.push(evaluateSearchCase(testCase, activeIds, 10));
}

const report = {
  generatedAt: new Date().toISOString(),
  ranking: "search_grant_catalog",
  k: 10,
  summary: summarizeSearchBenchmark(rows),
  cases: rows,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--enforce")) {
  const { recallAtK, precisionAtK, ndcgAtK, hardFailLeakage } = report.summary;
  if (recallAtK < 0.9 || precisionAtK < 0.75 || ndcgAtK < 0.8 || hardFailLeakage > 0) {
    process.exitCode = 1;
  }
}
