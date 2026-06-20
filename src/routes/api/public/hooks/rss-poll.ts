// Public webhook (called by pg_cron) that polls RSS feeds and enqueues
// discovery for matched funders. Authenticated via the project's anon key
// in the `apikey` header — the documented pattern for pg_cron → public hook.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/rss-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { ingestRssFeeds } = await import("@/lib/rss-ingestor.server");
          const result = await ingestRssFeeds();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => new Response(JSON.stringify({ status: "ok", hook: "rss-poll" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }),
    },
  },
});
