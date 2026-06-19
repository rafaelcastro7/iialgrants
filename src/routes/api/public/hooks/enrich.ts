import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — pg_cron calls every 15 minutes to enrich
// recently discovered grants. Auth: Supabase publishable (anon) key.
export const Route = createFileRoute("/api/public/hooks/enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runEnricher } = await import("@/agents/enricher.functions");

        const { data: grants, error } = await supabaseAdmin
          .from("grants")
          .select("id, title")
          .eq("status", "discovered")
          .order("discovered_at", { ascending: true })
          .limit(10);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const g of grants ?? []) {
          try {
            await runEnricher({ data: { grantId: g.id } });
            results.push({ id: g.id, ok: true });
          } catch (e) {
            results.push({ id: g.id, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
