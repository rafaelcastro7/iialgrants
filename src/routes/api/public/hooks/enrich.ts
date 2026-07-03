import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@/lib/webhook-auth.server";

// Public cron endpoint — pg_cron calls every 15 minutes to enrich
// recently discovered grants. Auth: HMAC-SHA256 + timestamp + nonce.
export const Route = createFileRoute("/api/public/hooks/enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { result } = await verifyWebhookRequest(request, "enrich");
        if (!result.ok) return new Response(result.reason, { status: result.status });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enrichGrantImpl } = await import("@/agents/enricher.functions");

        const { data: grants, error } = await supabaseAdmin
          .from("grants")
          .select("id, title")
          .eq("status", "discovered")
          .lt("enrich_attempts", 3)
          .order("discovered_at", { ascending: true })
          .limit(10);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const g of grants ?? []) {
          try {
            await enrichGrantImpl(g.id);
            results.push({ id: g.id, ok: true });
          } catch (e) {
            results.push({
              id: g.id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
