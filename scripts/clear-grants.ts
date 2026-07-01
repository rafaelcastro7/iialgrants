// Clears all grants and related data from Supabase for a fresh pipeline test.
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or key env vars");
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  // Order matters: FK constraints
  console.log("Clearing evidence_spans...");
  const e1 = await sb.from("evidence_spans").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("  evidence_spans:", e1.error?.message ?? "OK");

  console.log("Clearing grant_evaluations...");
  const e2 = await sb.from("grant_evaluations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("  grant_evaluations:", e2.error?.message ?? "OK");

  console.log("Clearing grant_events...");
  const e3 = await sb.from("grant_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("  grant_events:", e3.error?.message ?? "OK");

  console.log("Clearing agent_runs...");
  const e4 = await sb.from("agent_runs").delete().neq("run_id", "00000000");
  console.log("  agent_runs:", e4.error?.message ?? "OK");

  console.log("Clearing grants...");
  const e5 = await sb.from("grants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("  grants:", e5.error?.message ?? "OK");

  // Verify
  const { count } = await sb.from("grants").select("id", { count: "exact", head: true });
  console.log(`\nGrants remaining: ${count}`);
}

main().catch(console.error);
