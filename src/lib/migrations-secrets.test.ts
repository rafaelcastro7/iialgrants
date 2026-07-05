// Guard: no NEW secrets in supabase/migrations (QW3).
//
// Two legacy migrations embed the local anon JWT inside cron.schedule()
// http_post headers. The anon (publishable) key is public by design, so those
// are grandfathered — but service-role JWTs, passwords, or any new anon-key
// copies must never land in a migration, because migrations are immutable
// once applied and connected to Lovable (history can't be rewritten).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve("supabase/migrations");

// Known-legacy files allowed to contain the anon JWT (do not add to this list).
const GRANDFATHERED = new Set([
  "20260619232412_7316fcfd-5b97-4135-8386-92880774c6d0.sql",
  "20260619233915_14fe07d4-3d4b-431d-84b7-960365fb3614.sql",
]);

function decodeJwtRole(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

describe("migrations contain no secrets", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

  it("has migrations to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} has no service-role JWT or new embedded credentials`, () => {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");

      // Any JWT-looking token: header.payload.signature with base64url parts.
      const jwts = sql.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
      for (const jwt of jwts) {
        const role = decodeJwtRole(jwt);
        // service_role tokens are NEVER acceptable in a migration.
        expect(role, `service_role JWT found in ${file}`).not.toBe("service_role");
        // anon tokens only in the two grandfathered legacy files.
        if (role === "anon") {
          expect(
            GRANDFATHERED.has(file),
            `new anon JWT embedded in ${file} — use a vault/secret setting instead`,
          ).toBe(true);
        }
      }

      // Obvious credential literals.
      expect(sql).not.toMatch(/\bidentity_data\b.*"password"/i);
      expect(sql).not.toMatch(/\b(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{35})\b/);
    });
  }
});
