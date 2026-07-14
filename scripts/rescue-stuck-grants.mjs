#!/usr/bin/env node
// Safely rescue discovered grants that have useful partial enrichment data but
// exhausted retries. Default is dry-run. Use --apply to write changes.
//
// Contract:
// - Do not mark a grant "scored"; only the evaluator should do that because it
//   writes grant_evaluations, fit_score, and scored_at.
// - Move a grant to "enriched" only when it has at least summary or eligibility.
// - Preserve a machine-readable requirement note so the UI/humans can see which
//   fields are still missing.
//
// Usage:
//   node scripts/rescue-stuck-grants.mjs
//   node scripts/rescue-stuck-grants.mjs --apply

import { Client } from "pg";
import { appendFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.env.RESCUE_LIMIT || 50);
const LOG_FILE = "scripts/rescue-stuck-grants.log";
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres";

const client = new Client({ connectionString: DB_URL });

function log(msg) {
  console.log(msg);
  appendFileSync(LOG_FILE, `${msg}\n`);
}

function asRequirementArray(value) {
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

function buildRequirementNote(grant) {
  const missing = missingFields(grant);
  return {
    type: "partial_enrichment_review",
    status: "needs_human_review",
    note: `Partial enrichment rescued after retry exhaustion. Missing: ${missing.join(", ") || "none"}.`,
    missing_fields: missing,
    created_at: new Date().toISOString(),
  };
}

log(
  `[${new Date().toISOString()}] Starting partial-enrichment rescue (${APPLY ? "APPLY" : "DRY-RUN"})`,
);

await client.connect();
try {
  const stuck = await client.query(
    `
      SELECT
        id,
        title,
        summary,
        eligibility,
        requirements,
        enrich_attempts,
        amount_cad_min,
        amount_cad_max,
        deadline
      FROM grants
      WHERE status = 'discovered'
        AND enrich_attempts > 0
        AND (summary IS NOT NULL OR eligibility IS NOT NULL)
      ORDER BY enrich_last_attempt_at NULLS LAST, created_at
      LIMIT $1
    `,
    [LIMIT],
  );

  log(`Found ${stuck.rows.length} discovered grant(s) with partial data.\n`);

  let applied = 0;
  for (const grant of stuck.rows) {
    const hasSummary = !!grant.summary;
    const hasEligibility = hasObject(grant.eligibility);
    const missing = missingFields(grant);
    log(
      `[${grant.title}] summary=${hasSummary} eligibility=${hasEligibility} missing=${missing.join(", ") || "none"}`,
    );

    if (!hasSummary && !hasEligibility) {
      log("  skip: no useful partial data\n");
      continue;
    }

    const requirements = asRequirementArray(grant.requirements);
    const alreadyNoted = requirements.some((r) => r?.type === "partial_enrichment_review");
    const nextRequirements = alreadyNoted
      ? requirements
      : [...requirements, buildRequirementNote(grant)];

    if (!APPLY) {
      log("  dry-run: would set status='enriched', clear enrich_last_error, and add review note\n");
      continue;
    }

    await client.query(
      `
        UPDATE grants
        SET status = 'enriched',
            enriched_at = COALESCE(enriched_at, now()),
            requirements = $1::jsonb,
            enrich_last_error = NULL,
            enrich_last_attempt_at = now()
        WHERE id = $2
          AND status = 'discovered'
      `,
      [JSON.stringify(nextRequirements), grant.id],
    );
    applied++;
    log("  applied: marked enriched with partial-enrichment review note\n");
  }

  log(`Operation complete. Applied ${applied}/${stuck.rows.length}.`);
} finally {
  await client.end();
}
