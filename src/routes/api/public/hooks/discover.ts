import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Public cron endpoint — pg_cron calls this hourly to discover new grants.
// Auth: shared HMAC signature header `x-iial-signature` over the raw body.
export const Route = createFileRoute("/api/public/hooks/discover")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DISCOVERER_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("misconfigured", { status: 500 });
        }
        const signature = request.headers.get("x-iial-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
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
