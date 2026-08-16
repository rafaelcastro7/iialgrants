import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Server-side check used by agent server fns to short-circuit when off.
export async function assertModuleEnabled(name: string) {
  const { data, error } = await supabaseAdmin
    .from("module_flags")
    .select("enabled")
    .eq("module", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.enabled) {
    throw new Error(`module_disabled:${name}`);
  }
}
