// One-off audit: for every evidence_span whose deadline/amount came from a
// URL different from the grant's own page, check whether that source page
// would pass the (now-fixed) pageLooksRelevantToGrant filter. A "false"
// result means this historical data point was captured by the same
// cross-contamination bug fixed in enricher.functions.ts and needs review.
import { createClient } from "@supabase/supabase-js";
import {
  grantTitleTokens,
  pageLooksRelevantToGrant,
} from "../src/agents/deep-crawl-relevance.shared";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await supabase
  .from("evidence_spans")
  .select("grant_id, field, value, source_url, snippet, grants!inner(title, url)")
  .in("field", ["deadline", "amount_cad_min", "amount_cad_max"]);
if (error) throw new Error(error.message);

type Row = {
  grant_id: string;
  field: string;
  value: unknown;
  source_url: string;
  snippet: string;
  grants: { title: string; url: string };
};

const mismatched = (rows as unknown as Row[]).filter((r) => r.source_url !== r.grants.url);
console.log(
  `${mismatched.length} evidence span(s) sourced from a different page than the grant's own url\n`,
);

for (const r of mismatched) {
  const tokens = grantTitleTokens(r.grants.title);
  const relevant = pageLooksRelevantToGrant({ url: r.source_url, markdown: r.snippet }, tokens);
  console.log(
    `${relevant ? "OK  " : "BAD "} grant="${r.grants.title}" field=${r.field} value=${JSON.stringify(r.value)}`,
  );
  console.log(`     source: ${r.source_url}`);
  if (!relevant) console.log(`     snippet: ${r.snippet.slice(0, 150)}`);
  console.log("");
}
