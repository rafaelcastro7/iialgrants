// Server-side admin assertion shared by all admin server fns.
// Loads supabaseAdmin lazily to keep client bundle clean.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase query builder is intentional here
export async function assertAdmin(userId: string, db?: { from: (table: string) => any }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = db ?? supabaseAdmin;
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}
