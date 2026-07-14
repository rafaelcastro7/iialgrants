#!/usr/bin/env node
// Inspect a grant that appears stuck in enrichment.
//
// Usage:
//   node scripts/investigate-stuck.mjs
//   GRANT_TITLE="Capital of Development" node scripts/investigate-stuck.mjs

import { Client } from "pg";

const TITLE = process.env.GRANT_TITLE || "Capital of Development";
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres";

const client = new Client({ connectionString: DB_URL });

await client.connect();
try {
  console.log("=== STUCK GRANT INVESTIGATION ===\n");

  const result = await client.query(
    `
      SELECT
        id,
        title,
        url,
        status,
        enrich_attempts,
        enrich_last_error,
        enrich_last_attempt_at,
        COALESCE(jsonb_array_length(requirements), 0) AS req_count,
        summary,
        amount_cad_min,
        amount_cad_max,
        deadline
      FROM grants
      WHERE title ILIKE $1
      ORDER BY enrich_last_attempt_at DESC NULLS LAST
      LIMIT 1
    `,
    [`%${TITLE}%`],
  );

  if (result.rows.length === 0) {
    console.log(`Grant not found for title filter: ${TITLE}`);
    process.exit(0);
  }

  const g = result.rows[0];
  console.log(`[${g.title}]`);
  console.log(`  URL: ${g.url}`);
  console.log(`  Status: ${g.status}`);
  console.log(`  Enrich attempts: ${g.enrich_attempts}`);
  console.log(`  Requirements extracted: ${g.req_count}`);
  console.log(`  Last attempt: ${g.enrich_last_attempt_at || "[none]"}`);
  console.log(`  Last error: ${g.enrich_last_error?.slice(0, 180) || "[none]"}`);

  console.log("\n--- EXTRACTED DATA ---");
  console.log(`  Summary: ${g.summary?.slice(0, 140) || "[empty]"}`);
  console.log(
    `  Amount: ${g.amount_cad_min ? `$${g.amount_cad_min}` : "[empty]"} - ${
      g.amount_cad_max ? `$${g.amount_cad_max}` : "[empty]"
    }`,
  );
  console.log(`  Deadline: ${g.deadline || "[empty]"}`);

  console.log("\n--- NEXT STEPS ---");
  if (g.req_count === 0) console.log("  - Requirements are empty.");
  if (!g.amount_cad_min) console.log("  - Amount minimum not extracted.");
  if (!g.amount_cad_max) console.log("  - Amount maximum not extracted.");
  if (!g.deadline) console.log("  - Deadline not extracted.");
  if (g.enrich_last_error?.includes("timeout")) {
    console.log("  - Root cause may be timeout; inspect fetch attempts and source reachability.");
  }
} finally {
  await client.end();
}
