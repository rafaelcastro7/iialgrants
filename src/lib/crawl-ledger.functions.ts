// Server-fn for admin to read the crawl ledger health stats.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CrawlLedgerStats = {
  due_now: number; queued_24h: number; stable: number;
  gone: number; blocked: number; errored: number; total: number;
};

export type CrawlLedgerRecent = {
  url: string;
  host: string;
  status: string;
  last_fetched_at: string | null;
  next_fetch_at: string;
  interval_hours: number;
  change_count: number;
  via: string | null;
  title: string | null;
};

async function ensureAdmin(ctx: { supabase: { rpc: (n: string, p: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

export const getCrawlLedgerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CrawlLedgerStats> => {
    await ensureAdmin(context as never);
    const { ledgerStats } = await import("@/lib/crawl-ledger.server");
    return ledgerStats();
  });

export const getCrawlLedgerRecent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CrawlLedgerRecent[]> => {
    await ensureAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data, error } = await sb
      .from("crawl_ledger")
      .select("url, host, status, last_fetched_at, next_fetch_at, interval_hours, change_count, via, title")
      .order("last_fetched_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as CrawlLedgerRecent[];
  });
