import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

// Delete all grants and dependent data. Admin-only.
// Requires service-role client (supabaseAdmin) to bypass RLS on child tables.
export const resetAllGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        confirm: z.literal("DELETE_ALL_GRANTS"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const counts = { grants: 0, evidence: 0, evals: 0, events: 0, proposals: 0, submissions: 0 };

    // 1. Delete dependent data (required FKs first)
    const e1 = await supabaseAdmin
      .from("evidence_spans")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (e1.error) throw new Error(`evidence_spans: ${e1.error.message}`);

    const e2 = await supabaseAdmin
      .from("grant_evaluations")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (e2.error) throw new Error(`grant_evaluations: ${e2.error.message}`);

    const e3 = await supabaseAdmin
      .from("grant_events")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (e3.error) throw new Error(`grant_events: ${e3.error.message}`);

    const e4 = await supabaseAdmin
      .from("outcomes")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (e4.error) throw new Error(`outcomes: ${e4.error.message}`);

    const e5 = await supabaseAdmin
      .from("proposals")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (e5.error) throw new Error(`proposals: ${e5.error.message}`);

    const e6 = await supabaseAdmin
      .from("submissions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (e6.error) throw new Error(`submissions: ${e6.error.message}`);

    // 2. Delete nullable-FK data
    await supabaseAdmin.from("agent_trace_steps").delete().not("grant_id", "is", null);
    await supabaseAdmin.from("agent_runs").delete().not("grant_id", "is", null);
    await supabaseAdmin.from("notifications").delete().not("grant_id", "is", null);

    // 3. Delete all grants
    const eg = await supabaseAdmin
      .from("grants")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (eg.error) throw new Error(`grants: ${eg.error.message}`);

    // 4. Reset crawl_ledger so re-discovery works fresh
    await supabaseAdmin
      .from("crawl_ledger")
      .update({
        fetch_count: 0,
        error_count: 0,
        last_fetched_at: null,
        last_error: null,
        next_fetch_at: new Date().toISOString(),
      } as never)
      .gte("fetch_count", 0);

    return { ok: true, message: "All grants and dependent data deleted. Crawl ledger reset." };
  });
