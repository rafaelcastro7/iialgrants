import { createFileRoute } from "@tanstack/react-router";

// Daily cron — generates bilingual deadline reminders for grants
// that are active in a user's pipeline and due within 14 days.
// Auth: Lovable Cloud publishable key (apikey header).
export const Route = createFileRoute("/api/public/hooks/deadlines")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const today = new Date();
        const horizon = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        // Find proposals owned by users with grants in active pipeline + near deadline.
        const { data: rows, error } = await supabaseAdmin
          .from("proposals")
          .select("user_id, grant:grants!inner(id, title, title_fr, deadline, status)")
          .in("grant.status", ["shortlisted", "in_proposal", "submitted"])
          .lte("grant.deadline", horizon)
          .gte("grant.deadline", today.toISOString().slice(0, 10));
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let created = 0;
        for (const row of rows ?? []) {
          const g = row.grant as { id: string; title: string; title_fr: string | null; deadline: string };
          if (!g?.deadline) continue;

          // Idempotency: skip if a deadline notif for this grant was created in last 24h.
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabaseAdmin
            .from("notifications")
            .select("id")
            .eq("user_id", row.user_id)
            .eq("grant_id", g.id)
            .eq("kind", "deadline")
            .gte("created_at", since)
            .limit(1);
          if (existing && existing.length) continue;

          const daysLeft = Math.max(
            0,
            Math.ceil((new Date(g.deadline).getTime() - today.getTime()) / 86400000),
          );
          const { error: ne } = await supabaseAdmin.from("notifications").insert({
            user_id: row.user_id,
            grant_id: g.id,
            kind: "deadline",
            title_en: `Deadline in ${daysLeft} day(s)`,
            title_fr: `Échéance dans ${daysLeft} jour(s)`,
            body_en: `"${g.title}" closes on ${g.deadline}.`,
            body_fr: `« ${g.title_fr ?? g.title} » se termine le ${g.deadline}.`,
          });
          if (!ne) created++;
        }
        return Response.json({ ok: true, created });
      },
    },
  },
});
