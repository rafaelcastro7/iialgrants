const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.resolve(__dirname, "supabase/migrations");
const PASSWORD = "your-super-secret-and-long-postgres-password";

// Get list of applied migrations
const appliedRaw = execSync(
  `docker exec docker-db-1 psql -U postgres -d postgres -t -A -c "SELECT version FROM _supabase_migrations ORDER BY version;"`,
  { encoding: "utf8" },
);
const applied = new Set(appliedRaw.trim().split("\n").filter(Boolean));

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Applied: ${applied.size} migrations`);

let appliedCount = 0;
let errorCount = 0;

for (const file of files) {
  // Extract version from filename
  const match = file.match(/^(\d+)_?(.+)?\.sql$/);
  const version = match ? match[1] : file.replace(/\.sql$/, "");

  if (applied.has(version)) {
    continue; // Already applied
  }

  // Check if version without timestamp prefix is applied (legacy format)
  const legacyVersion = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
  if (applied.has(legacyVersion)) {
    continue;
  }

  const fullPath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(fullPath, "utf8");

  process.stdout.write(`Applying ${file}...`);

  try {
    // Apply SQL
    execSync(`docker exec -i docker-db-1 psql -U postgres -d postgres`, {
      input: sql,
      encoding: "utf8",
      timeout: 30000,
    });

    // Register migration
    execSync(
      `docker exec docker-db-1 psql -U postgres -d postgres -c "INSERT INTO _supabase_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;"`,
      { encoding: "utf8", timeout: 10000 },
    );

    // Also register legacy name if different
    if (legacyVersion !== version && !applied.has(legacyVersion)) {
      try {
        execSync(
          `docker exec docker-db-1 psql -U postgres -d postgres -c "INSERT INTO _supabase_migrations (version) VALUES ('${legacyVersion}') ON CONFLICT DO NOTHING;"`,
          { encoding: "utf8", timeout: 5000 },
        );
      } catch {}
    }

    console.log(" OK");
    appliedCount++;
  } catch (err) {
    console.log(" ERROR:", err.message.substring(0, 200));
    errorCount++;
    if (errorCount > 3) {
      console.log("Too many errors, stopping.");
      break;
    }
  }
}

console.log(`\nApplied: ${appliedCount} new migrations, Errors: ${errorCount}`);
