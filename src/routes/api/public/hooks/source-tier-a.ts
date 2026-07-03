// Daily Tier A discovery hook (RSS bundle).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/source-tier-a")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { runSourceCurator } = await import("@/lib/source-curator/orchestrator.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await runSourceCurator("A");
          // Also promote any stale candidates while we're here (cheap, idempotent).
          await supabaseAdmin.rpc("auto_promote_stale_candidates");
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
      GET: async () =>
        new Response(JSON.stringify({ status: "ok", hook: "source-tier-a" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
