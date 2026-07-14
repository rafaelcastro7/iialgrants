#!/usr/bin/env node
// Repair historical rows created by the old partial-rescue script.
//
// Default is dry-run. Use --apply to write changes.
//
// Repairs:
// - Backfill scored_at for already-scored grants from the latest evaluation.
// - Normalize legacy requirement type "extracted_partial" to
//   "partial_enrichment_review" so future audits use one vocabulary.

import { Client } from "pg";
import { appendFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const LOG_FILE = "scripts/repair-partial-scored-grants.log";
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres";

const client = new Client({ connectionString: DB_URL });

function log(message) {
  console.log(message);
  appendFileSync(LOG_FILE, `${message}\n`);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasObject(value) {
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}

function missingFields(grant) {
  const missing = [];
  if (grant.amount_cad_min == null) missing.push("amount_cad_min");
  if (grant.amount_cad_max == null) missing.push("amount_cad_max");
  if (!grant.deadline) missing.push("deadline");
  if (!hasObject(grant.eligibility)) missing.push("eligibility");
  return missing;
}

function normalizeRequirements(grant) {
  let changed = false;
  const missing = missingFields(grant);
  const requirements = asArray(grant.requirements).map((requirement) => {
    if (requirement?.type !== "extracted_partial") return requirement;
    changed = true;
    return {
      ...requirement,
      type: "partial_enrichment_review",
      status: requirement.status ?? "needs_human_review",
      missing_fields: Array.isArray(requirement.missing_fields)
        ? requirement.missing_fields
        : missing,
    };
  });
  return { requirements, changed };
}

log(
  `[${new Date().toISOString()}] Starting partial-scored repair (${APPLY ? "APPLY" : "DRY-RUN"})`,
);

await client.connect();
try {
  const rows = await client.query(`
    SELECT
      g.id,
      g.title,
      g.status,
      g.scored_at,
      g.requirements,
      g.amount_cad_min,
      g.amount_cad_max,
      g.deadline,
      g.eligibility,
      latest_eval.created_at AS latest_evaluation_at
    FROM grants g
    LEFT JOIN LATERAL (
      SELECT created_at
      FROM grant_evaluations ge
      WHERE ge.grant_id = g.id
      ORDER BY ge.created_at DESC NULLS LAST
      LIMIT 1
    ) latest_eval ON true
    WHERE (
        g.status = 'scored'
        AND g.scored_at IS NULL
        AND latest_eval.created_at IS NOT NULL
      )
      OR g.requirements @> '[{"type":"extracted_partial"}]'::jsonb
    ORDER BY g.title
  `);

  log(`Found ${rows.rows.length} row(s) needing review.\n`);
  let applied = 0;

  for (const grant of rows.rows) {
    const { requirements, changed: requirementsChanged } = normalizeRequirements(grant);
    const nextScoredAt =
      grant.status === "scored" && !grant.scored_at && grant.latest_evaluation_at
        ? grant.latest_evaluation_at
        : null;

    log(
      `[${grant.title}] status=${grant.status} backfill_scored_at=${nextScoredAt ? "yes" : "no"} normalize_requirements=${requirementsChanged ? "yes" : "no"}`,
    );

    if (!nextScoredAt && !requirementsChanged) {
      log("  skip: already clean\n");
      continue;
    }

    if (!APPLY) {
      log("  dry-run: would update historical rescue artifacts\n");
      continue;
    }

    await client.query(
      `
        UPDATE grants
        SET scored_at = COALESCE(scored_at, $1),
            requirements = $2::jsonb
        WHERE id = $3
      `,
      [nextScoredAt, JSON.stringify(requirements), grant.id],
    );
    applied++;
    log("  applied\n");
  }

  log(`Repair complete. Applied ${applied}/${rows.rows.length}.`);
} finally {
  await client.end();
}
