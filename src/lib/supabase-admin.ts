/**
 * Shared Supabase client factory for server functions.
 *
 * All `.functions.ts` files use this instead of inlining createClient with hardcoded URLs.
 * Ensures consistent env var resolution and eliminates 89+ duplicated `createClient` calls.
 */
export async function createSupabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL || "http://localhost:15435";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "Missing Supabase key: set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY in .env",
    );
  }
  return createClient(url, key);
}
