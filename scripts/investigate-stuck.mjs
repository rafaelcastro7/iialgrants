import { Client } from "pg";

const client = new Client({
  connectionString: "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres"
});

await client.connect();
try {
  console.log("=== STUCK GRANT INVESTIGATION ===\n");

  // Find the stuck grant
  const result = await client.query(`
    SELECT
      id, title, url, status,
      enrich_attempts, enrich_last_error, enrich_last_attempt_at,
      COALESCE(jsonb_array_length(requirements), 0) as req_count,
      summary, amount_cad_min, amount_cad_max, deadline
    FROM grants
    WHERE title LIKE '%Capital of Development%'
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    console.log("Grant not found");
    process.exit(0);
  }

  const g = result.rows[0];
  console.log(`[${g.title}]`);
  console.log(`  URL: ${g.url}`);
  console.log(`  Status: ${g.status}`);
  console.log(`  Enrich attempts: ${g.enrich_attempts}`);
  console.log(`  Requirements extracted: ${g.req_count}`);
  console.log(`  Last error: ${g.enrich_last_error?.slice(0, 150) || "[none]"}...`);

  console.log(`\n--- EXTRACTED DATA ---`);
  console.log(`  Summary: ${g.summary?.slice(0, 100) || "[empty]"}...`);
  console.log(`  Amount: ${g.amount_cad_min ? `$${g.amount_cad_min}` : "[empty]"} - ${g.amount_cad_max ? `$${g.amount_cad_max}` : "[empty]"}`);
  console.log(`  Deadline: ${g.deadline || "[empty]"}`);

  console.log(`\n--- NEXT STEPS ---`);
  if (g.req_count === 0) {
    console.log(`  1. Requirements are empty — enricher failed to extract`);
  }
  if (!g.amount_cad_min) {
    console.log(`  2. Amount not extracted — parsing issue`);
  }
  if (!g.deadline) {
    console.log(`  3. Deadline not extracted — date parsing issue`);
  }

  if (g.enrich_last_error && g.enrich_last_error.includes("timeout")) {
    console.log(`  → Root cause: TIMEOUT. Need dynamic timeout per grant-type.`);
  }

} finally {
  await client.end();
}
