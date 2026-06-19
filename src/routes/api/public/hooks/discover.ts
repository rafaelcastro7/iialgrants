import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — pg_cron calls this hourly to discover new grants.
// Auth: Supabase publishable (anon) key in the `apikey` header — the
// canonical Lovable Cloud pattern. No custom shared secrets.
export const Route = createFileRoute("/api/public/hooks/discover")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDiscoverer } = await import("@/agents/discoverer.functions");

        const { data: funders, error } = await supabaseAdmin
          .from("funders")
          .select("id, name")
          .eq("active", true)
          .not("source_url", "is", null);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ funder: string; result: unknown; error?: string }> = [];
        for (const f of funders ?? []) {
          try {
            const r = await runDiscoverer({ data: { funderId: f.id } });
            results.push({ funder: f.name, result: r });
          } catch (e) {
            results.push({ funder: f.name, result: null, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
