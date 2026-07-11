import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";
import type { AutonomyIntel } from "@/lib/autonomy-intel.server";

// Admin-only live view of the local self-improvement daemons + memory /
// Obsidian / lessons / techniques / skills. The heavy lifting (filesystem
// reads) is in autonomy-intel.server.ts, imported lazily here so node:fs never
// enters the client bundle.
export const getAutonomyIntel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutonomyIntel> => {
    await assertAdmin(context.userId);
    const { readAutonomyIntel } = await import("@/lib/autonomy-intel.server");
    return readAutonomyIntel();
  });
