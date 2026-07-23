// One-off bulk review: 1,282 funder_candidates were sitting unreviewed
// (777 "candidate" + 505 "pending_review") — real organizations discovery
// already found (bbf_programs, t3010_charities, otf_open, grants_gov,
// tri_council, eu_ft_portal) but nobody had promoted to the actual `funders`
// table the app actually searches. Reviewed the pool by sampling every
// source and checking for non-organizations before writing this: found only
// a handful of genuine non-funders (workers' compensation boards — an
// insurance/regulatory body, not a grantor) and exactly one row that
// concatenates six distinct regional innovation centres into a single
// "name" (a scrape artifact, not one organization) — both excluded below,
// everything else promotes.
//
// Usage: bun scripts/bulk-promote-funder-candidates.ts [--apply]
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes("--apply");

const NOT_A_FUNDER = [
  /workers'?\s*compensation/i, // insurance/regulatory body, not a grantor
  /^headquarters$/i, // too generic to identify a real organization
];
const MULTI_ENTITY_ARTIFACT = new Set([
  "Innovate Niagara, WEtech Alliance, Innovation Factory, Haltech, TechAlliance, Innovation Guelph",
]);

type Candidate = {
  id: string;
  name: string;
  name_fr: string | null;
  province: string | null;
  funder_type: string | null;
  website: string | null;
  bn_number: string | null;
  disbursed_annual: number | null;
};

const { data: candidates, error } = await supabase
  .from("funder_candidates")
  .select("id, name, name_fr, province, funder_type, website, bn_number, disbursed_annual")
  .in("status", ["candidate", "pending_review"]);
if (error) throw new Error(error.message);

const { data: existingFunders } = await supabase.from("funders").select("name");
const existingNames = new Set(
  (existingFunders ?? []).map((f) => f.name.trim().toLowerCase()),
);

let promoted = 0;
let excludedNotAFunder = 0;
let excludedArtifact = 0;
let excludedAlreadyExists = 0;
let excludedNoWebsite = 0;

for (const c of candidates as Candidate[]) {
  if (MULTI_ENTITY_ARTIFACT.has(c.name)) {
    excludedArtifact++;
    console.log(`ARTIFACT (skip): ${c.name}`);
    continue;
  }
  if (NOT_A_FUNDER.some((re) => re.test(c.name))) {
    excludedNotAFunder++;
    console.log(`NOT-A-FUNDER (skip): ${c.name}`);
    continue;
  }
  if (existingNames.has(c.name.trim().toLowerCase())) {
    excludedAlreadyExists++;
    continue;
  }
  if (!c.website || !c.website.trim()) {
    // No source to crawl — promoting this would just be a dead entry in the
    // funders directory forever. Left as a candidate (not discarded) so it's
    // still visible in /admin/candidates for someone to attach a real
    // website later, most of these are T3010 charity-registry rows, which
    // don't carry a URL at all.
    excludedNoWebsite++;
    continue;
  }

  promoted++;
  if (apply) {
    const { error: insErr } = await supabase.from("funders").insert({
      name: c.name,
      name_fr: c.name_fr ?? null,
      country: "CA",
      jurisdiction: c.province ?? null,
      website: c.website ?? null,
      source_url: c.website ?? null,
      source_type: "manual",
      bn_number: c.bn_number ?? null,
      disbursed_annual: c.disbursed_annual ?? null,
      active: true,
    });
    if (insErr) {
      console.log(`INSERT ERROR for "${c.name}": ${insErr.message}`);
      promoted--;
      continue;
    }
    await supabase
      .from("funder_candidates")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", c.id);
  }
}

console.log(
  `\n${promoted} ${apply ? "promoted" : "would be promoted"}, ${excludedNotAFunder} excluded (not a funder), ${excludedArtifact} excluded (multi-entity artifact), ${excludedAlreadyExists} excluded (name already in funders).`,
);
if (!apply) console.log("Dry run — re-run with --apply to actually write.");
