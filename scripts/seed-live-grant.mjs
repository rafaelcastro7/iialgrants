// Seeds one real funder + grant (status=discovered) + a user org_profile into
// the LOCAL Supabase, then prints LIVE_GRANT_ID / LIVE_USER_ID for the
// live-pipeline vitest. Uses the service-role client (bypasses RLS).
//   node scripts/seed-live-grant.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "http://localhost:15435";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY (source it from .env)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// A real, content-rich Canadian grant page (NRC IRAP) — good enrichment target.
const GRANT_URL =
  "https://nrc.canada.ca/en/support-technology-innovation/financial-support-technology-innovation";

// Fixed (not timestamp-suffixed) so repeated runs reuse the same auth user
// instead of creating a new throwaway account every time — the same
// insert-every-run bug already fixed below for grants. Left unfixed, this had
// already accumulated 19 orphaned "live-pilot-*" auth.users rows (out of 22
// total) locally, which is enough to push real users off admin-users' first
// (and only, unpaginated) page.
const PILOT_EMAIL = "live-pilot@iial.test";

async function main() {
  // 1. Create (or reuse) a pilot user (auth) to own the org profile + evaluation.
  let userId;
  const { data: created, error: ue } = await db.auth.admin.createUser({
    email: PILOT_EMAIL,
    email_confirm: true,
    password: "live-pilot-pass-123",
  });
  if (created) {
    userId = created.user.id;
  } else if (/already.*registered|exists/i.test(ue?.message ?? "")) {
    const { data: list, error: le } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (le) throw new Error(`listUsers: ${le.message}`);
    const existingUser = list.users.find((u) => u.email === PILOT_EMAIL);
    if (!existingUser)
      throw new Error(`createUser said "${ue.message}" but listUsers found no match`);
    userId = existingUser.id;
  } else {
    throw new Error(`createUser: ${ue.message}`);
  }

  // 2. Funder.
  let funderId;
  const { data: existing } = await db
    .from("funders")
    .select("id")
    .eq("name", "National Research Council Canada (IRAP)")
    .maybeSingle();
  if (existing) {
    funderId = existing.id;
  } else {
    const { data: f, error: fe } = await db
      .from("funders")
      .insert({
        name: "National Research Council Canada (IRAP)",
        jurisdiction: "CA",
        website: "https://nrc.canada.ca",
        source_url: "https://nrc.canada.ca",
        active: true,
      })
      .select("id")
      .single();
    if (fe) throw new Error(`funder insert: ${fe.message}`);
    funderId = f.id;
  }

  // 3. Grant in "discovered" status (empty structured fields → enricher fills).
  // Idempotent: reuse the same (funder_id, url) row across repeated runs
  // instead of inserting a new one each time. The old code generated a
  // fabricated always-unique source_hash ("live-irap-" + Date.now()) with no
  // canonical_key, which exists specifically to dodge both the source_hash
  // and canonical_key unique constraints — after ~16 repeated live-pipeline
  // test runs across 2026-07-03/04, that left 16 duplicate IRAP grants in the
  // real local dataset (with contradictory extracted amounts: $10, $831,
  // $336M, $1M for the "same" program), polluting the dashboard/grants list
  // a real user reads. Reset-and-reuse instead of insert-every-time.
  // .limit(1) is load-bearing, not cosmetic: .maybeSingle() alone returns
  // data:null + a PGRST116 error (not a throw) when a query matches >1 row,
  // and this script's own real local DB already has 14+ rows sharing this
  // exact (funder_id, url) pair from before this fix existed. Without
  // .limit(1), an unchecked PGRST116 silently looks identical to "no existing
  // row", routing into the insert branch below and recreating the exact
  // duplicate-row bug this fix exists to close. .limit(1) guarantees the
  // query itself returns at most one row, so maybeSingle() always succeeds.
  const { data: existingGrant, error: lookupErr } = await db
    .from("grants")
    .select("id")
    .eq("funder_id", funderId)
    .eq("url", GRANT_URL)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupErr) throw new Error(`grant lookup: ${lookupErr.message}`);

  let g;
  if (existingGrant) {
    const { data: reset, error: re } = await db
      .from("grants")
      .update({
        status: "discovered",
        amount_cad_min: null,
        amount_cad_max: null,
        deadline: null,
        eligibility: {},
        sectors: [],
        enrich_attempts: 0,
        enrich_last_error: null,
        requirements: null,
        enriched_at: null,
      })
      .eq("id", existingGrant.id)
      .select("id")
      .single();
    if (re) throw new Error(`grant reset: ${re.message}`);
    g = reset;
  } else {
    const { data: inserted, error: ge } = await db
      .from("grants")
      .insert({
        funder_id: funderId,
        title: "Industrial Research Assistance Program (IRAP)",
        summary: "Financial support for technology innovation by Canadian SMEs.",
        language: "en",
        url: GRANT_URL,
        status: "discovered",
        source_hash: "live-irap-seed",
        country: "CA",
        amount_cad_min: null,
        amount_cad_max: null,
        deadline: null,
        eligibility: {},
        sectors: [],
        enrich_attempts: 0,
      })
      .select("id")
      .single();
    if (ge) throw new Error(`grant insert: ${ge.message}`);
    g = inserted;
  }

  // 4. Org profile for fit evaluation. Upsert on user_id (its primary key,
  // same pattern org.functions.ts already uses elsewhere) — with PILOT_EMAIL
  // now fixed/reused, an unconditional insert would fail on the 2nd+ run.
  const { error: oe } = await db.from("org_profiles").upsert(
    {
      user_id: userId,
      org_name: "IIAL Pilot Org",
      sectors: ["technology", "ai"],
      jurisdictions: ["CA", "ON"],
      stage: "sme",
      annual_budget_cad: 500000,
      focus_areas: ["applied research", "supply chain", "ai"],
    },
    { onConflict: "user_id" },
  );
  if (oe) throw new Error(`org_profile upsert: ${oe.message}`);

  console.log("SEED_OK");
  console.log(`LIVE_GRANT_ID=${g.id}`);
  console.log(`LIVE_USER_ID=${userId}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
