// One-off cleanup: the discoverer's canonical_key dedup is title-word-based,
// so an LLM paraphrasing the same real program's title differently across
// discovery runs produced multiple grant rows for the same underlying page
// (confirmed live: 19 URL+funder clusters, up to 6 duplicates each). Fixed
// going forward in discoverer.impl.server.ts (URL+funder_id is now an
// independent dedup signal); this script resolves the rows that already
// exist. Canonical choice per cluster: has a submission > has a proposal >
// highest fit_score > most non-null enrichment fields > earliest discovered.
// Losers are ARCHIVED (never deleted) with a note pointing at the canonical
// row, so history stays intact and reversible.
//
// Usage: bun scripts/dedupe-duplicate-grants.ts [--apply]
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes("--apply");

type Grant = {
  id: string;
  title: string;
  url: string;
  funder_id: string;
  status: string;
  discovered_at: string;
  amount_cad_min: number | null;
  amount_cad_max: number | null;
  deadline: string | null;
  eligibility: unknown;
  sectors: string[] | null;
};

const { data: grants, error } = await supabase
  .from("grants")
  .select(
    "id, title, url, funder_id, status, discovered_at, amount_cad_min, amount_cad_max, deadline, eligibility, sectors",
  )
  .not("status", "in", "(archived,expired)");
if (error) throw new Error(error.message);

const byCluster = new Map<string, Grant[]>();
for (const g of grants as Grant[]) {
  const k = `${g.url}|${g.funder_id}`;
  const list = byCluster.get(k) ?? [];
  list.push(g);
  byCluster.set(k, list);
}

const { data: propRows } = await supabase.from("proposals").select("grant_id");
const { data: subRows } = await supabase.from("submissions").select("grant_id");
const hasProposal = new Set((propRows ?? []).map((r) => r.grant_id));
const hasSubmission = new Set((subRows ?? []).map((r) => r.grant_id));

const { data: evalRows } = await supabase.from("grant_evaluations").select("grant_id, fit_score");
const fitScoreByGrant = new Map((evalRows ?? []).map((r) => [r.grant_id, r.fit_score as number]));

function completeness(g: Grant): number {
  return [
    g.amount_cad_min != null,
    g.amount_cad_max != null,
    g.deadline != null,
    g.eligibility != null && Object.keys(g.eligibility as object).length > 0,
    (g.sectors?.length ?? 0) > 0,
  ].filter(Boolean).length;
}

function rank(g: Grant): [number, number, number, number, number] {
  return [
    hasSubmission.has(g.id) ? 1 : 0,
    hasProposal.has(g.id) ? 1 : 0,
    fitScoreByGrant.get(g.id) ?? -1,
    completeness(g),
    -new Date(g.discovered_at).getTime(), // earlier discovered_at ranks higher
  ];
}

function cmp(a: Grant, b: Grant): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return rb[i] - ra[i];
  }
  return 0;
}

let clustersWithDupes = 0;
let totalArchived = 0;
for (const [key, members] of byCluster) {
  if (members.length < 2) continue;
  clustersWithDupes++;
  const sorted = [...members].sort(cmp);
  const canonical = sorted[0];
  const losers = sorted.slice(1);
  console.log(`\nCluster: ${key}`);
  console.log(`  KEEP    ${canonical.id} :: "${canonical.title}" (status=${canonical.status})`);
  for (const loser of losers) {
    console.log(`  ARCHIVE ${loser.id} :: "${loser.title}" (status=${loser.status})`);
    if (hasSubmission.has(loser.id) || hasProposal.has(loser.id)) {
      console.log(
        `    !! SKIPPING — this "loser" has its own proposal/submission, needs manual review`,
      );
      continue;
    }
    totalArchived++;
    if (apply) {
      const { error: updateError } = await supabase
        .from("grants")
        .update({
          status: "archived",
          enrich_last_error: `manual_correction: duplicate of grant ${canonical.id} ("${canonical.title}") — same source URL, discoverer's title-based canonical_key missed it (LLM paraphrased the title differently across discovery runs). Fixed going forward in discoverer.impl.server.ts.`,
        })
        .eq("id", loser.id);
      if (updateError) console.log(`    ERROR: ${updateError.message}`);
    }
  }
}

console.log(
  `\n${clustersWithDupes} cluster(s) with duplicates, ${totalArchived} grant(s) ${apply ? "archived" : "would be archived"}.`,
);
if (!apply) console.log("Dry run — re-run with --apply to actually update the database.");
