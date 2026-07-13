#!/usr/bin/env node
// Data Quality Analyzer — deep dive into what facts are missing, why,
// and what extraction improvements would help most.

import { Client } from "pg";
import { writeFileSync } from "node:fs";

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres",
});

const LOG = "scripts/data-quality-analysis.md";

function log(text) {
  console.log(text);
  writeFileSync(LOG, text + "\n", { flag: "a" });
}

writeFileSync(LOG, ""); // clear

log("# Data Quality Analysis\n");
log(`_Generated: ${new Date().toISOString()}_\n`);

await client.connect();
try {
  // Get all scored/active grants
  const grants = await client.query(`
    SELECT
      id, title, url, status,
      summary, amount_cad_min, amount_cad_max, deadline, eligibility, sectors
    FROM grants
    WHERE status IN ('scored', 'in_proposal')
    ORDER BY title
    LIMIT 100
  `);

  log(`## Coverage Analysis (${grants.rows.length} grants)\n`);

  const stats = {
    total: grants.rows.length,
    summary: 0,
    amount_min: 0,
    amount_max: 0,
    deadline: 0,
    eligibility: 0,
    sectors: 0,
  };

  const missing = {
    summary: [],
    amount: [],
    deadline: [],
    eligibility: [],
    sectors: [],
  };

  for (const g of grants.rows) {
    if (g.summary) stats.summary++;
    else missing.summary.push(g.title);

    if (g.amount_cad_min) stats.amount_min++;
    else missing.amount.push(g.title);

    if (g.amount_cad_max) stats.amount_max++;

    if (g.deadline) stats.deadline++;
    else missing.deadline.push(g.title);

    const eligHasData = g.eligibility && Object.keys(g.eligibility).length > 0;
    if (eligHasData) stats.eligibility++;
    else missing.eligibility.push(g.title);

    const sectorsHasData = g.sectors && g.sectors.length > 0;
    if (sectorsHasData) stats.sectors++;
    else missing.sectors.push(g.title);
  }

  log("| Field | ✓ Present | ✗ Missing | Coverage |");
  log("|-------|-----------|-----------|----------|");
  log(`| Summary | ${stats.summary} | ${missing.summary.length} | ${Math.round((stats.summary / stats.total) * 100)}% |`);
  log(`| Amount (min) | ${stats.amount_min} | ${missing.amount.length} | ${Math.round((stats.amount_min / stats.total) * 100)}% |`);
  log(`| Deadline | ${stats.deadline} | ${missing.deadline.length} | ${Math.round((stats.deadline / stats.total) * 100)}% |`);
  log(`| Eligibility | ${stats.eligibility} | ${missing.eligibility.length} | ${Math.round((stats.eligibility / stats.total) * 100)}% |`);
  log(`| Sectors | ${stats.sectors} | ${missing.sectors.length} | ${Math.round((stats.sectors / stats.total) * 100)}% |`);

  const avgCoverage = Math.round(
    ((stats.summary +
      stats.amount_min +
      stats.deadline +
      stats.eligibility +
      stats.sectors) /
      (stats.total * 5)) *
      100
  );
  log(`\n**Overall Completeness: ${avgCoverage}%** (target: 85%)\n`);

  log("## Top Missing Fields\n");
  log("### Grants missing DEADLINE (highest impact)\n");
  missing.deadline.slice(0, 10).forEach((t) => log(`  - ${t}`));

  log("\n### Grants missing AMOUNT\n");
  missing.amount.slice(0, 10).forEach((t) => log(`  - ${t}`));

  log("\n## Validation Rules Needed\n");
  log("- **Amount validation**: Must be numeric, > 0, reasonable range (< $100M)");
  log("- **Deadline validation**: Must be future date, YYYY-MM-DD format");
  log("- **Eligibility validation**: Must be object with known keys (age, sector, location, etc)");
  log("- **Summary validation**: Min 20 chars, max 500 chars, no HTML tags");

  log("\n## Extraction Improvements\n");
  log(
    "1. **Date parsing**: Handle 'January 15, 2027', '15-01-2027', 'End of Q3 2027', etc."
  );
  log(
    "2. **Amount parsing**: Handle '$1.5M', '1,500,000 CAD', 'up to $2M', ranges, etc."
  );
  log(
    "3. **Eligibility extraction**: Parse eligibility text into structured fields"
  );
  log("4. **Sector inference**: If missing, infer from URL/title/summary keywords");
} finally {
  await client.end();
}

log("\n---\nAnalysis complete.");
