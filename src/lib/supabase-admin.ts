/**
 * Shared Supabase client factory for server functions.
 *
 * All `.functions.ts` files use this instead of inlining createClient with hardcoded URLs.
 * Ensures consistent env var resolution and eliminates 89+ duplicated `createClient` calls.
 */
export async function createSupabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );
}
