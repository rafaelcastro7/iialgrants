// Run all Supabase migrations against the local Docker database.
// Usage: node scripts/apply-local-migrations.mjs

import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { Client } from "pg";

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:54322/postgres";
const MIGRATIONS_DIR = resolve(import.meta.dirname, "../supabase/migrations");

async function main() {
  console.log(`Connecting to: ${DB_URL.replace(/:.*@/, ":***@")}`);
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Create migrations tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS _supabase_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files`);

  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const version = file.replace(".sql", "").replace(/^\d+_/, "");
    const { rows } = await client.query(
      "SELECT 1 FROM _supabase_migrations WHERE version = $1",
      [version],
    );

    if (rows.length > 0) {
      skipped++;
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    console.log(`Applying: ${file}`);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO _supabase_migrations (version) VALUES ($1)",
        [version],
      );
      await client.query("COMMIT");
      applied++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FAILED: ${err.message}`);
      // Continue with next migration instead of aborting
    }
  }

  await client.end();
  console.log(`\nDone: ${applied} applied, ${skipped} already applied`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
