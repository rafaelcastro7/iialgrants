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

async function main() {
  // 1. Create a pilot user (auth) to own the org profile + evaluation.
  const email = `live-pilot-${Date.now()}@iial.test`;
  const { data: u, error: ue } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "live-pilot-pass-123",
  });
  if (ue) throw new Error(`createUser: ${ue.message}`);
  const userId = u.user.id;

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
  const { data: g, error: ge } = await db
    .from("grants")
    .insert({
      funder_id: funderId,
      title: "Industrial Research Assistance Program (IRAP)",
      summary: "Financial support for technology innovation by Canadian SMEs.",
      language: "en",
      url: GRANT_URL,
      status: "discovered",
      source_hash: "live-irap-" + Date.now(),
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

  // 4. Org profile for fit evaluation.
  const { error: oe } = await db.from("org_profiles").insert({
    user_id: userId,
    org_name: "IIAL Pilot Org",
    sectors: ["technology", "ai"],
    jurisdictions: ["CA", "ON"],
    stage: "sme",
    annual_budget_cad: 500000,
    focus_areas: ["applied research", "supply chain", "ai"],
  });
  if (oe) throw new Error(`org_profile insert: ${oe.message}`);

  console.log("SEED_OK");
  console.log(`LIVE_GRANT_ID=${g.id}`);
  console.log(`LIVE_USER_ID=${userId}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
