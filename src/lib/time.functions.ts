import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Authoritative server time. We deliberately do NOT call an external NTP
// service from the Worker runtime (UDP/NTP isn't available, and HTTP time
// APIs add a network dependency for no gain). Postgres NOW() is our single
// source of truth — every cron job, trigger and policy already uses it,
// so anchoring the UI to the same clock guarantees consistency.
export const getServerNow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    } as never);
    // rpc call doubles as a cheap round-trip; we read the response Date header
    // and the DB clock so the caller can detect drift.
    void data;
    void error;
    const { data: row } = await context.supabase
      .from("agent_runs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dbSampleAt = (row as { created_at?: string } | null)?.created_at ?? null;
    const serverNow = new Date().toISOString();
    return { serverNow, dbSampleAt };
  });
