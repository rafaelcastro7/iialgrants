import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@/lib/webhook-auth.server";

// Public cron endpoint — pg_cron calls this hourly to discover new grants.
// Auth: HMAC-SHA256 signature with timestamp + single-use nonce.
// See src/lib/webhook-auth.server.ts and docs/evidence/webhook-auth.md.
export const Route = createFileRoute("/api/public/hooks/discover")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { result } = await verifyWebhookRequest(request, "discover");
        if (!result.ok) return new Response(result.reason, { status: result.status });

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
