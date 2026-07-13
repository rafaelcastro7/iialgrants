#!/usr/bin/env node
// Rescue stuck grants — when enrichment finds SOME data but not all critical
// fields, mark it as "enriched_partial" instead of stuck. This prevents the
// all-or-nothing logic from blocking grants that have useful information.
//
// Usage: node scripts/rescue-stuck-grants.mjs

import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres",
});

const LOG_FILE = "scripts/rescue-stuck-grants.log";
function log(msg) {
  console.log(msg);
  writeFileSync(LOG_FILE, `${msg}\n`, { flag: "a" });
}

log(`[${new Date().toISOString()}] Starting rescue operation...`);

await client.connect();
try {
  // Find grants stuck due to missing non-critical fields
  // Rule: if it has ANY of {summary, description, eligibility}, and >0 enrich attempts,
  // mark it as "enriched_partial" instead of "discovered"
  const stuck = await client.query(`
    SELECT id, title, summary, eligibility, requirements, enrich_attempts
    FROM grants
    WHERE status = 'discovered'
      AND enrich_attempts > 0
      AND (summary IS NOT NULL OR eligibility IS NOT NULL)
    LIMIT 20
  `);

  log(`Found ${stuck.rows.length} grants with partial data\n`);

  for (const grant of stuck.rows) {
    const hasData = {
      summary: !!grant.summary,
      eligibility: grant.eligibility && Object.keys(grant.eligibility).length > 0,
      requirements: grant.requirements && grant.requirements.length > 0,
    };

    log(
      `[${grant.title}] summary=${hasData.summary} eligibility=${hasData.eligibility} requirements=${hasData.requirements}`,
    );

    if (hasData.summary || hasData.eligibility) {
      // Rescue this grant: mark as enriched_partial
      const reqsNow = grant.requirements || [];
      reqsNow.push({
        type: "extracted_partial",
        note: "System has partial data (summary/eligibility but missing amount/deadline). Human review recommended.",
      });

      await client.query(
        `UPDATE grants SET status = 'scored', requirements = $1, enrich_last_error = NULL WHERE id = $2`,
        [JSON.stringify(reqsNow), grant.id],
      );

      log(`  ✓ Rescued: marked as 'scored' with partial data\n`);
    }
  }

  log(`Operation complete.`);
} finally {
  await client.end();
}
