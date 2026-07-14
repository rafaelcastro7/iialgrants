#!/usr/bin/env node
// Data Quality Analyzer: deep dive into missing grant facts, pipeline integrity,
// and extraction improvements that would raise data completeness.

import { Client } from "pg";
import { writeFileSync } from "node:fs";

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres",
});

const LOG = "scripts/data-quality-analysis.md";

function log(text = "") {
  console.log(text);
  writeFileSync(LOG, `${text}\n`, { flag: "a" });
}

function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

writeFileSync(LOG, "");

log("# Data Quality Analysis");
log();
log(`_Generated: ${new Date().toISOString()}_`);
log();

await client.connect();
try {
  const grants = await client.query(`
    SELECT
      id,
      title,
      url,
      status,
      summary,
      amount_cad_min,
      amount_cad_max,
      deadline,
      eligibility,
      sectors,
      scored_at
    FROM grants
    WHERE status IN ('scored', 'in_proposal')
    ORDER BY title
    LIMIT 100
  `);

  log(`## Coverage Analysis (${grants.rows.length} grants)`);
  log();

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

  for (const grant of grants.rows) {
    if (grant.summary) stats.summary++;
    else missing.summary.push(grant.title);

    if (grant.amount_cad_min != null) stats.amount_min++;
    else missing.amount.push(grant.title);

    if (grant.amount_cad_max != null) stats.amount_max++;

    if (grant.deadline) stats.deadline++;
    else missing.deadline.push(grant.title);

    const eligibilityHasData = grant.eligibility && Object.keys(grant.eligibility).length > 0;
    if (eligibilityHasData) stats.eligibility++;
    else missing.eligibility.push(grant.title);

    const sectorsHaveData = Array.isArray(grant.sectors) && grant.sectors.length > 0;
    if (sectorsHaveData) stats.sectors++;
    else missing.sectors.push(grant.title);
  }

  log("| Field | Present | Missing | Coverage |");
  log("|-------|---------|---------|----------|");
  log(
    `| Summary | ${stats.summary} | ${missing.summary.length} | ${pct(stats.summary, stats.total)}% |`,
  );
  log(
    `| Amount (min) | ${stats.amount_min} | ${missing.amount.length} | ${pct(stats.amount_min, stats.total)}% |`,
  );
  log(
    `| Deadline | ${stats.deadline} | ${missing.deadline.length} | ${pct(stats.deadline, stats.total)}% |`,
  );
  log(
    `| Eligibility | ${stats.eligibility} | ${missing.eligibility.length} | ${pct(stats.eligibility, stats.total)}% |`,
  );
  log(
    `| Sectors | ${stats.sectors} | ${missing.sectors.length} | ${pct(stats.sectors, stats.total)}% |`,
  );

  const avgCoverage = pct(
    stats.summary + stats.amount_min + stats.deadline + stats.eligibility + stats.sectors,
    stats.total * 5,
  );
  log();
  log(`**Overall Completeness: ${avgCoverage}%** (target: 85%)`);
  log();

  const integrity = await client.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE g.status = 'scored'
          AND NOT EXISTS (SELECT 1 FROM grant_evaluations ge WHERE ge.grant_id = g.id)
      )::int AS scored_missing_eval,
      COUNT(*) FILTER (WHERE g.status = 'scored' AND g.scored_at IS NULL)::int AS scored_missing_scored_at,
      COUNT(*) FILTER (WHERE g.requirements @> '[{"type":"partial_enrichment_review"}]'::jsonb)::int
        AS partial_review_notes,
      COUNT(*) FILTER (WHERE g.requirements @> '[{"type":"extracted_partial"}]'::jsonb)::int
        AS legacy_partial_notes
    FROM grants g
  `);
  const integrityRow = integrity.rows[0];

  log("## Pipeline Integrity");
  log();
  log(`- Scored grants missing evaluation: ${integrityRow.scored_missing_eval}`);
  log(`- Scored grants missing scored_at: ${integrityRow.scored_missing_scored_at}`);
  log(`- Partial review notes: ${integrityRow.partial_review_notes}`);
  log(`- Legacy partial notes: ${integrityRow.legacy_partial_notes}`);
  log();

  log("## Top Missing Fields");
  log();
  log("### Grants missing DEADLINE (highest impact)");
  missing.deadline.slice(0, 10).forEach((title) => log(`- ${title}`));

  log();
  log("### Grants missing AMOUNT");
  missing.amount.slice(0, 10).forEach((title) => log(`- ${title}`));

  log();
  log("## Validation Rules Needed");
  log();
  log("- Amount validation: must be numeric, positive, and below a reasonable ceiling.");
  log("- Deadline validation: must be a future date or explicit rolling/no-deadline signal.");
  log("- Eligibility validation: must be a structured object with known applicant constraints.");
  log("- Summary validation: 20-500 chars, no HTML tags, grounded in source text.");

  log();
  log("## Extraction Improvements");
  log();
  log(
    "1. Date parsing: handle English/French long dates, ranges, rolling calls, and fiscal periods.",
  );
  log(
    "2. Amount parsing: handle CAD formats, shorthand amounts, ranges, and maximum contribution caps.",
  );
  log("3. Eligibility extraction: parse applicant type, location, sector, stage, and exclusions.");
  log(
    "4. Sector inference: infer from URL/title/summary when funder pages omit structured sectors.",
  );
} finally {
  await client.end();
}

log();
log("---");
log("Analysis complete.");
